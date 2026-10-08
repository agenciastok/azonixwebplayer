import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { catalogProxyError, proxyPlayerApi } from "./catalogProxy";

async function handle(req: IncomingMessage, res: ServerResponse) {
  const controller = new AbortController();
  res.on("close", () => {
    if (!res.writableEnded) controller.abort();
  });
  try {
    const requestUrl = new URL(req.url ?? "", "http://localhost");
    const target = requestUrl.searchParams.get("url");
    const response = target ? await proxyPlayerApi(target, controller.signal) : catalogProxyError("URL ausente", 400);
    res.statusCode = response.status;
    response.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });
    if (req.method === "HEAD" || !response.body) {
      res.end();
      return;
    }
    const stream = Readable.fromWeb(response.body as import("node:stream/web").ReadableStream);
    stream.on("error", () => {
      if (!res.writableEnded) res.destroy();
    });
    res.on("error", () => {
      if (!stream.destroyed) stream.destroy();
    });
    stream.pipe(res);
  } catch (error) {
    if (controller.signal.aborted || res.writableEnded) return;
    if (!res.headersSent) res.statusCode = 502;
    res.end(error instanceof Error ? error.message : "Falha ao consultar a lista");
  }
}

export function iptvProxy(): Plugin {
  return {
    name: "azonix-catalog-proxy",
    configureServer(server) {
      server.middlewares.use("/api/iptv/proxy", (req, res) => {
        void handle(req, res);
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use("/api/iptv/proxy", (req, res) => {
        void handle(req, res);
      });
    },
  };
}
