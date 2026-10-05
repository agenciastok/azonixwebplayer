import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";

const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

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
          const absolute = new URL(uri, base).href;
          return `URI="${proxyPath(absolute)}"`;
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

function headerValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function pipeUpstream(body: ReadableStream<Uint8Array>, res: ServerResponse) {
  const stream = Readable.fromWeb(body as import("node:stream/web").ReadableStream);
  stream.on("error", () => {
    if (!res.writableEnded) res.destroy();
  });
  res.on("error", () => {
    if (!stream.destroyed) stream.destroy();
  });
  stream.pipe(res);
}

function applyHeaders(upstream: Response, res: ServerResponse) {
  const type = upstream.headers.get("content-type");
  if (type) res.setHeader("content-type", type);
  const length = upstream.headers.get("content-length");
  if (length) res.setHeader("content-length", length);
  const range = upstream.headers.get("content-range");
  if (range) res.setHeader("content-range", range);
  const accept = upstream.headers.get("accept-ranges");
  if (accept) res.setHeader("accept-ranges", accept);
}

async function handle(req: IncomingMessage, res: ServerResponse) {
  const controller = new AbortController();
  res.on("close", () => {
    if (!res.writableEnded) controller.abort();
  });
  try {
    const requestUrl = new URL(req.url ?? "", "http://localhost");
    const target = requestUrl.searchParams.get("url");
    if (!target) {
      res.statusCode = 400;
      res.end("URL ausente");
      return;
    }
    const parsed = new URL(target);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      res.statusCode = 400;
      res.end("Protocolo não permitido");
      return;
    }
    if (blockedHost(parsed.hostname)) {
      res.statusCode = 403;
      res.end("Host bloqueado");
      return;
    }

    const headers: Record<string, string> = {
      "user-agent": BROWSER_UA,
      accept: "*/*",
    };
    const range = headerValue(req.headers.range);
    const accept = headerValue(req.headers.accept) ?? "";
    const image = isImageTarget(parsed, accept);
    const directMedia = isDirectMedia(parsed);
    const namedPlaylist = /\.m3u8$/i.test(parsed.pathname) || isCatalog(parsed);
    if (range && !namedPlaylist) headers.range = range;

    const method = req.method === "HEAD" ? "HEAD" : "GET";
    let upstream = await fetch(parsed.href, {
      method,
      headers,
      redirect: "follow",
      signal: controller.signal,
    });
    if ((upstream.status === 403 || upstream.status === 401) && headers.range) {
      await upstream.body?.cancel().catch(() => undefined);
      const withoutRange = { ...headers };
      delete withoutRange.range;
      upstream = await fetch(parsed.href, {
        method,
        headers: withoutRange,
        redirect: "follow",
        signal: controller.signal,
      });
    }
    if (upstream.status === 403 || upstream.status === 401) {
      await upstream.body?.cancel().catch(() => undefined);
      const { range: _range, ...rest } = headers;
      void _range;
      upstream = await fetch(parsed.href, {
        method,
        headers: { ...rest, "user-agent": "VLC/3.0.20 LibVLC/3.0.20" },
        redirect: "follow",
        signal: controller.signal,
      });
    }
    const finalUrl = upstream.url || parsed.href;
    res.statusCode = upstream.status;
    res.setHeader("cache-control", image ? "public, max-age=86400" : "no-cache");

    if (req.method === "HEAD" || !upstream.body) {
      applyHeaders(upstream, res);
      res.end();
      return;
    }

    if (image || directMedia) {
      applyHeaders(upstream, res);
      pipeUpstream(upstream.body, res);
      return;
    }

    const reader = upstream.body.getReader();
    const first = await reader.read();
    const head = Buffer.from(first.value ?? new Uint8Array());
    const preview = head.subarray(0, 128).toString("utf8").replace(/^\uFEFF/, "").trimStart();
    const playlist = !isCatalog(parsed) && preview.startsWith("#EXTM3U");

    let pending = head;
    if (playlist) {
      const chunks = [head];
      let size = head.length;
      let complete = first.done;
      while (!complete && size < 2_000_000) {
        const next = await reader.read();
        if (next.done) {
          complete = true;
          break;
        }
        chunks.push(Buffer.from(next.value));
        size += next.value.byteLength;
      }
      if (complete) {
        const rewritten = rewritePlaylist(Buffer.concat(chunks).toString("utf8"), finalUrl);
        res.setHeader("content-type", "application/vnd.apple.mpegurl");
        res.end(rewritten);
        return;
      }
      pending = Buffer.concat(chunks);
    } else if (first.done) {
      applyHeaders(upstream, res);
      res.end(pending);
      return;
    }

    applyHeaders(upstream, res);
    res.write(pending);
    const rest = new ReadableStream<Uint8Array>({
      async pull(controller) {
        const next = await reader.read();
        if (next.done) controller.close();
        else controller.enqueue(next.value);
      },
      cancel() {
        reader.cancel().catch(() => undefined);
      },
    });
    pipeUpstream(rest, res);
  } catch (error) {
    if (controller.signal.aborted || res.writableEnded) return;
    if (!res.headersSent) res.statusCode = 502;
    res.end(error instanceof Error ? error.message : "Falha no proxy");
  }
}

function mount(middlewares: { use: (path: string, handler: (req: IncomingMessage, res: ServerResponse) => void) => void }) {
  middlewares.use("/api/upstream", (req, res) => {
    void handle(req, res);
  });
}

export function iptvProxy(): Plugin {
  return {
    name: "azonix-iptv-proxy",
    configureServer(server) {
      mount(server.middlewares);
    },
    configurePreviewServer(server) {
      mount(server.middlewares);
    },
  };
}
