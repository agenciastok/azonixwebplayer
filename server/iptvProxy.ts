import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { GET as playlist } from "../api/proxy/playlist";
import { GET as stream } from "../api/proxy/stream";

async function handle(req: IncomingMessage, res: ServerResponse, get: (request: Request) => Promise<Response>) {
  try {
    const request = new Request(new URL(req.url ?? "", "http://localhost"));
    const response = await get(request);
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
    if (res.writableEnded) return;
    if (!res.headersSent) res.statusCode = 500;
    res.end(error instanceof Error ? error.message : "Falha ao consultar a lista");
  }
}

export function iptvProxy(): Plugin {
  return {
    name: "azonix-catalog-proxy",
    configureServer(server) {
      server.middlewares.use("/api/proxy/playlist", (req, res) => {
        void handle(req, res, playlist);
      });
      server.middlewares.use("/api/proxy/stream", (req, res) => {
        void handle(req, res, stream);
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use("/api/proxy/playlist", (req, res) => {
        void handle(req, res, playlist);
      });
      server.middlewares.use("/api/proxy/stream", (req, res) => {
        void handle(req, res, stream);
      });
    },
  };
}
