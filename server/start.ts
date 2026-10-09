import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import { Readable } from "node:stream";
import { corsPreflight, withCors } from "./cors";
import { GET as playlist } from "./playlistProxy";
import { GET as stream } from "./streamProxy";

const distDir = path.resolve(process.env.DIST_DIR || "dist");
const port = Number(process.env.PORT || 3000);

const TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".map": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function applyCors(res: ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");
}

function sendApi(req: IncomingMessage, res: ServerResponse, response: Response) {
  const outgoing = withCors(response);
  res.statusCode = outgoing.status;
  outgoing.headers.forEach((value, key) => {
    if (key === "transfer-encoding") return;
    res.setHeader(key, value);
  });
  applyCors(res);
  if (req.method === "HEAD" || !outgoing.body) {
    res.end();
    return;
  }
  const body = Readable.fromWeb(outgoing.body as import("node:stream/web").ReadableStream);
  body.on("error", () => {
    if (!res.writableEnded) res.destroy();
  });
  res.on("error", () => {
    if (!body.destroyed) body.destroy();
  });
  body.pipe(res);
}

async function handleApi(req: IncomingMessage, res: ServerResponse, get: (request: Request) => Promise<Response>) {
  try {
    if (req.method === "OPTIONS") {
      sendApi(req, res, corsPreflight());
      return;
    }
    const request = new Request(new URL(req.url ?? "/", "http://localhost"));
    sendApi(req, res, await get(request));
  } catch (error) {
    if (res.writableEnded || res.headersSent) return;
    const message = error instanceof Error ? error.message : "Falha ao consultar a lista";
    console.error("Erro no proxy:", message);
    sendApi(
      req,
      res,
      new Response(JSON.stringify({ error: message }), {
        status: 500,
        headers: { "content-type": "application/json", "cache-control": "no-store" },
      }),
    );
  }
}

function fileFor(urlPath: string) {
  let decoded = urlPath;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  const relative = decoded.replace(/^\/+/, "");
  const full = path.resolve(distDir, relative);
  const rel = path.relative(distDir, full);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return full;
}

function sendFile(req: IncomingMessage, res: ServerResponse, file: string) {
  const type = TYPES[path.extname(file).toLowerCase()] || "application/octet-stream";
  res.statusCode = 200;
  res.setHeader("Content-Type", type);
  res.setHeader("Cache-Control", path.basename(file) === "index.html" ? "no-cache" : "public, max-age=86400");
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  createReadStream(file).pipe(res);
}

function sendIndex(req: IncomingMessage, res: ServerResponse) {
  const index = path.join(distDir, "index.html");
  if (!existsSync(index)) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Build ausente. Rode npm run build.");
    return;
  }
  sendFile(req, res, index);
}

const server = createServer((req, res) => {
  const pathname = (req.url ?? "/").split("?")[0] || "/";
  if (pathname === "/api/proxy/playlist" || pathname.startsWith("/api/proxy/playlist/")) {
    void handleApi(req, res, playlist);
    return;
  }
  if (pathname === "/api/proxy/stream" || pathname.startsWith("/api/proxy/stream/")) {
    void handleApi(req, res, stream);
    return;
  }
  if (pathname.startsWith("/api/")) {
    applyCors(res);
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Rota não encontrada" }));
    return;
  }
  const file = fileFor(pathname);
  if (file && existsSync(file) && statSync(file).isFile()) {
    sendFile(req, res, file);
    return;
  }
  sendIndex(req, res);
});

server.listen(port, "0.0.0.0", () => {
  console.log(`AZONIX PLAY em http://0.0.0.0:${port}`);
});
