const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const MEDIA_PATH = /\.(m3u8?|ts|mp4|m4v|mkv|webm|aac|mp3|flv|avi|mpg|mpeg|mov|m4a|ogg|opus)(\?|$)/i;
const VIDEO_TYPE = /^video\/|mp2t|mpegts|mpegurl/i;

function blockedHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true;
  if (host === "::1" || host === "0.0.0.0") return true;
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;
  return false;
}

export function catalogProxyError(message: string, status: number) {
  return new Response(message, { status, headers: { "cache-control": "no-store" } });
}

function isPlayerApi(url: URL) {
  return url.pathname.toLowerCase().endsWith("/player_api.php") && !MEDIA_PATH.test(url.pathname);
}

function rejectTarget(url: URL): Response | null {
  if (url.protocol !== "http:" && url.protocol !== "https:") return catalogProxyError("Protocolo não permitido", 400);
  if (MEDIA_PATH.test(url.pathname)) return catalogProxyError("URL de mídia não é aceita.", 400);
  if (!isPlayerApi(url)) return catalogProxyError("Só a lista do player_api.php pode passar por aqui.", 400);
  if (blockedHost(url.hostname)) return catalogProxyError("Host bloqueado", 403);
  return null;
}

async function fetchCatalog(url: URL, signal?: AbortSignal) {
  let upstream = await fetch(url, {
    method: "GET",
    headers: { "user-agent": BROWSER_UA, accept: "application/json,text/plain,*/*" },
    redirect: "manual",
    signal,
  });
  if (upstream.status === 401 || upstream.status === 403) {
    await upstream.body?.cancel().catch(() => undefined);
    upstream = await fetch(url, {
      method: "GET",
      headers: { "user-agent": "VLC/3.0.20 LibVLC/3.0.20", accept: "application/json,text/plain,*/*" },
      redirect: "manual",
      signal,
    });
  }
  return upstream;
}

export async function proxyPlayerApi(target: string, signal?: AbortSignal) {
  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return catalogProxyError("URL inválida", 400);
  }

  for (let hop = 0; hop < 3; hop += 1) {
    const rejected = rejectTarget(parsed);
    if (rejected) return rejected;

    const upstream = await fetchCatalog(parsed, signal);
    const location = upstream.headers.get("location");
    if (upstream.status >= 300 && upstream.status < 400 && location) {
      await upstream.body?.cancel().catch(() => undefined);
      parsed = new URL(location, parsed);
      continue;
    }

    const type = upstream.headers.get("content-type") || "";
    if (VIDEO_TYPE.test(type)) {
      await upstream.body?.cancel().catch(() => undefined);
      return catalogProxyError("URL de mídia não é aceita.", 400);
    }

    const headers = new Headers({ "cache-control": "no-store" });
    if (type) headers.set("content-type", type);
    if (upstream.ok) {
      headers.set("cache-control", "public, s-maxage=3600");
      headers.set("cdn-cache-control", "public, s-maxage=3600");
    }
    return new Response(upstream.body, { status: upstream.status, headers });
  }

  return catalogProxyError("Redirecionamento inválido", 400);
}
