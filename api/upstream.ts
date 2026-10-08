const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const MEDIA_PATH = /\.(m3u8?|ts|mp4|m4v|mkv|webm|aac|mp3|flv|avi|mpg|mpeg|mov|m4a|ogg|opus)(\?|$)/i;
const VIDEO_TYPE = /^video\/|mp2t|mpegts/i;

export const maxDuration = 60;

function blockedHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true;
  if (host === "::1" || host === "0.0.0.0") return true;
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;
  return false;
}

function isImage(url: URL) {
  return /\.(png|jpe?g|webp|gif|bmp|svg|ico|avif)(\?|$)/i.test(url.pathname);
}

function isTextCatalog(url: URL) {
  const path = url.pathname.toLowerCase();
  return path.endsWith("/player_api.php") || path.endsWith("/get.php");
}

function textResponse(message: string, status: number) {
  return new Response(message, { status, headers: { "cache-control": "no-cache" } });
}

async function openUpstream(url: string, method: string, headers: Record<string, string>, signal: AbortSignal) {
  let upstream = await fetch(url, { method, headers, redirect: "follow", signal });
  if (upstream.status === 403 || upstream.status === 401) {
    await upstream.body?.cancel().catch(() => undefined);
    upstream = await fetch(url, {
      method,
      headers: { ...headers, "user-agent": "VLC/3.0.20 LibVLC/3.0.20" },
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
  return headers;
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

  const image = isImage(parsed);
  const catalog = isTextCatalog(parsed);
  if (MEDIA_PATH.test(parsed.pathname) || (!image && !catalog)) {
    return textResponse("Mídia não é retransmitida por este servidor.", 415);
  }

  const method = req.method === "HEAD" ? "HEAD" : "GET";
  const upstream = await openUpstream(parsed.href, method, { "user-agent": BROWSER_UA, accept: "*/*" }, req.signal);
  const type = upstream.headers.get("content-type") || "";
  if (VIDEO_TYPE.test(type)) {
    await upstream.body?.cancel().catch(() => undefined);
    return textResponse("Mídia não é retransmitida por este servidor.", 415);
  }

  const cache = image ? "public, max-age=86400" : "no-cache";
  if (method === "HEAD" || !upstream.body) {
    return new Response(null, { status: upstream.status, headers: forwardHeaders(upstream, cache) });
  }
  return new Response(upstream.body, { status: upstream.status, headers: forwardHeaders(upstream, cache) });
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
