const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export const maxDuration = 60;

function blockedHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true;
  if (host === "::1" || host === "0.0.0.0") return true;
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;
  return false;
}

function proxyPath(absoluteUrl: string) {
  return `/api/upstream?url=${encodeURIComponent(absoluteUrl)}`;
}

function rewritePlaylist(body: string, baseUrl: string) {
  const base = new URL(baseUrl);
  return body
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith("#")) {
        return line.replace(/URI="([^"]+)"/gi, (_match, uri: string) => {
          return `URI="${proxyPath(new URL(uri, base).href)}"`;
        });
      }
      return proxyPath(new URL(trimmed, base).href);
    })
    .join("\n");
}

function isCatalog(url: URL) {
  return url.pathname.endsWith("/get.php") || url.search.includes("m3u_plus");
}

function isImageTarget(url: URL, accept: string) {
  if (/\.(png|jpe?g|webp|gif|bmp|svg|ico|avif)(\?|$)/i.test(url.pathname)) return true;
  if (/\.(m3u8|ts|mp4|m4v|webm|mkv|aac|mp3)(\?|$)/i.test(url.pathname) || isCatalog(url)) return false;
  return /image\//i.test(accept);
}

function isDirectMedia(url: URL) {
  return /\.(ts|mp4|m4v|webm|mkv|aac|mp3)(\?|$)/i.test(url.pathname);
}

function textResponse(message: string, status: number) {
  return new Response(message, { status, headers: { "cache-control": "no-cache" } });
}

function concat(chunks: Uint8Array[]) {
  const size = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const body = new Uint8Array(size);
  let offset = 0;
  chunks.forEach((chunk) => {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  });
  return body;
}

async function openUpstream(url: string, method: string, headers: Record<string, string>, signal: AbortSignal) {
  let upstream = await fetch(url, { method, headers, redirect: "follow", signal });
  if ((upstream.status === 403 || upstream.status === 401) && headers.range) {
    await upstream.body?.cancel().catch(() => undefined);
    const withoutRange = { ...headers };
    delete withoutRange.range;
    upstream = await fetch(url, { method, headers: withoutRange, redirect: "follow", signal });
  }
  if (upstream.status === 403 || upstream.status === 401) {
    await upstream.body?.cancel().catch(() => undefined);
    const { range: _range, ...rest } = headers;
    void _range;
    upstream = await fetch(url, {
      method,
      headers: { ...rest, "user-agent": "VLC/3.0.20 LibVLC/3.0.20" },
      redirect: "follow",
      signal,
    });
  }
  return upstream;
}

function forwardHeaders(upstream: Response, cache: string) {
  const headers = new Headers({ "cache-control": cache });
  const type = upstream.headers.get("content-type");
  if (type) headers.set("content-type", type);
  const length = upstream.headers.get("content-length");
  if (length) headers.set("content-length", length);
  const range = upstream.headers.get("content-range");
  if (range) headers.set("content-range", range);
  const accept = upstream.headers.get("accept-ranges");
  if (accept) headers.set("accept-ranges", accept);
  return headers;
}

function continueStream(
  upstream: Response,
  cache: string,
  pending: Uint8Array,
  reader: ReadableStreamDefaultReader<Uint8Array>,
  finished: boolean,
) {
  let sentPending = false;
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (!sentPending) {
        sentPending = true;
        if (pending.byteLength) controller.enqueue(pending);
        if (finished) {
          controller.close();
          return;
        }
      }
      const next = await reader.read();
      if (next.done) controller.close();
      else controller.enqueue(next.value);
    },
    cancel() {
      reader.cancel().catch(() => undefined);
    },
  });
  return new Response(body, { status: upstream.status, headers: forwardHeaders(upstream, cache) });
}

async function handle(req: Request) {
  const target = new URL(req.url).searchParams.get("url");
  if (!target) return textResponse("URL ausente", 400);

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return textResponse("URL inválida", 400);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return textResponse("Protocolo não permitido", 400);
  if (blockedHost(parsed.hostname)) return textResponse("Host bloqueado", 403);

  const headers: Record<string, string> = { "user-agent": BROWSER_UA, accept: "*/*" };
  const range = req.headers.get("range");
  const accept = req.headers.get("accept") ?? "";
  const image = isImageTarget(parsed, accept);
  const directMedia = isDirectMedia(parsed);
  const namedPlaylist = /\.m3u8$/i.test(parsed.pathname) || isCatalog(parsed);
  if (range && !namedPlaylist) headers.range = range;

  const method = req.method === "HEAD" ? "HEAD" : "GET";
  const upstream = await openUpstream(parsed.href, method, headers, req.signal);
  const cache = image ? "public, max-age=86400" : "no-cache";
  if (method === "HEAD" || !upstream.body) {
    return new Response(null, { status: upstream.status, headers: forwardHeaders(upstream, cache) });
  }
  if (image || directMedia) {
    return new Response(upstream.body, { status: upstream.status, headers: forwardHeaders(upstream, cache) });
  }

  const reader = upstream.body.getReader();
  const first = await reader.read();
  const head = first.value ?? new Uint8Array();
  const preview = new TextDecoder("utf-8", { fatal: false }).decode(head.subarray(0, 128)).replace(/^\uFEFF/, "").trimStart();
  const playlist = !isCatalog(parsed) && preview.startsWith("#EXTM3U");

  if (!playlist) {
    return continueStream(upstream, cache, head, reader, first.done);
  }

  const chunks = [head];
  let size = head.byteLength;
  let complete = first.done;
  while (!complete && size < 2_000_000) {
    const next = await reader.read();
    if (next.done) {
      complete = true;
      break;
    }
    chunks.push(next.value);
    size += next.value.byteLength;
  }

  if (complete) {
    const rewritten = rewritePlaylist(new TextDecoder().decode(concat(chunks)), upstream.url || parsed.href);
    return new Response(rewritten, {
      status: upstream.status,
      headers: { "content-type": "application/vnd.apple.mpegurl", "cache-control": cache },
    });
  }

  return continueStream(upstream, cache, concat(chunks), reader, false);
}

export async function GET(req: Request) {
  try {
    return await handle(req);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") return new Response(null, { status: 499 });
    return textResponse(error instanceof Error ? error.message : "Falha no proxy", 502);
  }
}

export async function HEAD(req: Request) {
  return GET(req);
}
