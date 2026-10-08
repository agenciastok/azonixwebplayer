import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";

const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const MEDIA_PATH = /\.(m3u8?|ts|mp4|m4v|mkv|webm|aac|mp3|flv|avi|mpg|mpeg|mov|m4a|ogg|opus)(\?|$)/i;
const VIDEO_TYPE = /^video\/|mp2t|mpegts/i;

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

    const image = isImage(parsed);
    const catalog = isTextCatalog(parsed);
    if (MEDIA_PATH.test(parsed.pathname) || (!image && !catalog)) {
      res.statusCode = 415;
      res.end("Mídia não é retransmitida por este servidor.");
      return;
    }

    const method = req.method === "HEAD" ? "HEAD" : "GET";
    let upstream = await fetch(parsed.href, {
      method,
      headers: { "user-agent": BROWSER_UA, accept: "*/*" },
      redirect: "follow",
      signal: controller.signal,
    });
    if (upstream.status === 403 || upstream.status === 401) {
      await upstream.body?.cancel().catch(() => undefined);
      upstream = await fetch(parsed.href, {
        method,
        headers: { "user-agent": "VLC/3.0.20 LibVLC/3.0.20", accept: "*/*" },
        redirect: "follow",
        signal: controller.signal,
      });
    }

    const type = upstream.headers.get("content-type") || "";
    if (VIDEO_TYPE.test(type)) {
      await upstream.body?.cancel().catch(() => undefined);
      res.statusCode = 415;
      res.end("Mídia não é retransmitida por este servidor.");
      return;
    }

    res.statusCode = upstream.status;
    res.setHeader("cache-control", image ? "public, max-age=86400" : "no-cache");
    if (req.method === "HEAD" || !upstream.body) {
      applyHeaders(upstream, res);
      res.end();
      return;
    }
    applyHeaders(upstream, res);
    pipeUpstream(upstream.body, res);
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
