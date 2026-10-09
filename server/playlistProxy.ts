export const maxDuration = 15;

const MEDIA_PATH = /\.(m3u8|ts|mp4|m4v|mkv|webm|aac|mp3|flv|avi|mpg|mpeg|mov)(\?|$)/i;

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
    if (MEDIA_PATH.test(parsed.pathname)) return plain("URL de mídia não é aceita.", 400);
    const path = parsed.pathname.toLowerCase();
    if (!path.endsWith("/player_api.php") && !path.endsWith("/get.php")) {
      return plain("Só get.php e player_api.php podem passar por aqui.", 400);
    }
    if (blockedHost(parsed.hostname)) return plain("Host bloqueado", 403);

    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      },
      signal: AbortSignal.timeout(12_000),
    });

    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      return plain(`Erro no provedor: ${response.status}`, response.status);
    }

    const finalPath = new URL(response.url || targetUrl).pathname;
    if (MEDIA_PATH.test(finalPath)) {
      await response.body?.cancel().catch(() => undefined);
      return plain("URL de mídia não é aceita.", 400);
    }

    return new Response(response.body, {
      status: 200,
      headers: {
        "Content-Type": response.headers.get("content-type") || "application/json",
        "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao consultar a lista";
    console.error("Erro no Proxy:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json", "cache-control": "no-store" },
    });
  }
}
