export const maxDuration = 60;

const STREAM_PATH = /\.(m3u8|ts)(?=($|\?))/i;
const MEDIA_URI = /\.(m3u8|ts)(?=($|\?))/i;

function blockedHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true;
  if (host === "::1" || host === "0.0.0.0") return true;
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;
  return false;
}

function plain(message: string, status: number) {
  return new Response(message, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}

function targetFrom(request: Request) {
  const query = request.url.split("?").slice(1).join("?");
  const encoded = /(?:^|&)url=([^&]*)/.exec(query)?.[1];
  if (!encoded) return null;
  return decodeURIComponent(encoded);
}

function proxied(absolute: string) {
  return `/api/proxy/stream?url=${encodeURIComponent(absolute)}`;
}

function routeMedia(absolute: string) {
  if (!/^http:\/\//i.test(absolute)) return absolute;
  if (MEDIA_URI.test(absolute)) return proxied(absolute);
  return absolute.replace(/^http:\/\//i, "https://");
}

function rewritePlaylist(body: string, baseUrl: string) {
  const base = new URL(baseUrl);
  return body
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith("#")) {
        return line.replace(/URI="([^"]+)"/gi, (_match, uri: string) => `URI="${routeMedia(new URL(uri, base).href)}"`);
      }
      return routeMedia(new URL(trimmed, base).href);
    })
    .join("\n");
}

export async function GET(request: Request) {
  try {
    let targetUrl: string | null;
    try {
      targetUrl = targetFrom(request);
    } catch {
      return plain("URL inválida", 400);
    }
    if (!targetUrl) return plain("URL ausente", 400);

    let parsed: URL;
    try {
      parsed = new URL(targetUrl);
    } catch {
      return plain("URL inválida", 400);
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return plain("Protocolo não permitido", 400);
    if (!STREAM_PATH.test(parsed.pathname)) return plain("URL de mídia não é aceita.", 400);
    if (blockedHost(parsed.hostname)) return plain("Host bloqueado", 403);

    const playlist = /\.m3u8$/i.test(parsed.pathname);
    const response = await fetch(targetUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
      signal: AbortSignal.timeout(playlist ? 12_000 : 55_000),
    });

    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      return plain(`Erro no provedor: ${response.status}`, response.status);
    }

    const finalPath = new URL(response.url || targetUrl).pathname;
    if (!STREAM_PATH.test(finalPath)) {
      await response.body?.cancel().catch(() => undefined);
      return plain("URL de mídia não é aceita.", 400);
    }

    if (!playlist) {
      return new Response(response.body, {
        status: 200,
        headers: {
          "Content-Type": "video/mp2t",
          "Cache-Control": "no-store",
        },
      });
    }

    const text = await response.text();
    return new Response(rewritePlaylist(text, response.url || targetUrl), {
      status: 200,
      headers: {
        "Content-Type": "application/x-mpegURL",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao abrir o canal";
    console.error("Erro no stream:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json", "cache-control": "no-store" },
    });
  }
}
