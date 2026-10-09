export const maxDuration = 10;

const LIVE_PATH = /\.(m3u8|ts)(?=($|\?))/i;

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
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
    },
  });
}

function targetFrom(request: Request) {
  const query = request.url.split("?").slice(1).join("?");
  const encoded = /(?:^|&)url=([^&]*)/.exec(query)?.[1];
  if (!encoded) return null;
  return decodeURIComponent(encoded);
}

function json(url: string) {
  return new Response(JSON.stringify({ url }), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
    },
  });
}

async function hop(current: string, signal: AbortSignal) {
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  };
  let response = await fetch(current, { method: "HEAD", redirect: "manual", headers, signal });
  if (response.status === 405 || response.status === 501 || response.status === 400 || response.status === 404) {
    await response.body?.cancel().catch(() => undefined);
    response = await fetch(current, { method: "GET", redirect: "manual", headers, signal });
  }
  const location = response.headers.get("location");
  const status = response.status;
  await response.body?.cancel().catch(() => undefined);
  return { status, location };
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

    let current: string;
    try {
      const parsed = new URL(targetUrl);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return plain("Protocolo não permitido", 400);
      if (!LIVE_PATH.test(parsed.pathname)) return plain("URL de mídia não é aceita.", 400);
      if (blockedHost(parsed.hostname)) return plain("Host bloqueado", 403);
      current = parsed.href;
    } catch {
      return plain("URL inválida", 400);
    }

    const signal = AbortSignal.timeout(8_000);
    for (let hopIndex = 0; hopIndex < 4; hopIndex += 1) {
      const response = await hop(current, signal);
      if (response.status < 300 || response.status >= 400 || !response.location) return json(current);
      let next: URL;
      try {
        next = new URL(response.location, current);
      } catch {
        return json(current);
      }
      if (next.protocol !== "http:" && next.protocol !== "https:") return json(current);
      if (blockedHost(next.hostname)) return json(current);
      if (next.href === current) return json(current);
      current = next.href;
    }
    return json(current);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao localizar o canal";
    console.error("Erro no redirect:", message);
    return plain("Não foi possível localizar o canal.", 502);
  }
}
