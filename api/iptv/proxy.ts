import { catalogProxyError, proxyPlayerApi } from "../../server/catalogProxy";

export const maxDuration = 30;

export async function GET(req: Request) {
  const target = new URL(req.url).searchParams.get("url");
  if (!target) return catalogProxyError("URL ausente", 400);
  try {
    return await proxyPlayerApi(target, req.signal);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") return new Response(null, { status: 499 });
    return catalogProxyError(error instanceof Error ? error.message : "Falha ao consultar a lista", 502);
  }
}
