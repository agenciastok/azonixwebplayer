import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";

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

function targetFrom(request: Request) {
  const query = request.url.split("?").slice(1).join("?");
  const encoded = /(?:^|&)url=([^&]*)/.exec(query)?.[1];
  if (!encoded) return null;
  return decodeURIComponent(encoded);
}

export function readLocation(target: string) {
  return new Promise<{ status: number; location: string | null }>((resolve, reject) => {
    let settled = false;
    const finish = (value: { status: number; location: string | null }) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      reject(error instanceof Error ? error : new Error("Falha ao localizar o canal"));
    };
    const url = new URL(target);
    const send = url.protocol === "https:" ? httpsRequest : httpRequest;
    const req = send(
      url,
      {
        method: "GET",
        timeout: 6000,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          Accept: "*/*",
          Connection: "close",
        },
      },
      (res) => {
        const raw = res.headers.location;
        const location = Array.isArray(raw) ? raw[0] ?? null : raw ?? null;
        finish({ status: res.statusCode ?? 0, location });
        res.destroy();
        req.destroy();
      },
    );
    req.on("timeout", () => {
      req.destroy();
      fail(new Error("timeout"));
    });
    req.on("error", fail);
    req.end();
  });
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

    let current: URL;
    try {
      current = new URL(targetUrl);
    } catch {
      return plain("URL inválida", 400);
    }
    if (current.protocol !== "http:" && current.protocol !== "https:") return plain("Protocolo não permitido", 400);
    if (!LIVE_PATH.test(current.pathname)) return plain("URL de mídia não é aceita.", 400);
    if (blockedHost(current.hostname)) return plain("Host bloqueado", 403);

    try {
      const response = await readLocation(current.href);
      if (response.status < 300 || response.status >= 400 || !response.location) return json(current.href);
      const next = new URL(response.location, current);
      if (next.protocol !== "http:" && next.protocol !== "https:") return json(current.href);
      if (blockedHost(next.hostname)) return json(current.href);
      return json(next.href);
    } catch {
      return json(current.href);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao localizar o canal";
    console.error("Erro no redirect:", message);
    return plain("Não foi possível localizar o canal.", 502);
  }
}
