import { dnsForCode } from "../data/codes";
import { functionHeaders, functionUrl } from "./supabase";

export async function resolveDns(code: string) {
  const trimmed = code.trim();
  if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY) {
    return dnsForCode(trimmed);
  }

  const response = await fetch(functionUrl("resolve-code"), {
    method: "POST",
    headers: functionHeaders(),
    body: JSON.stringify({ code: trimmed }),
  });

  if (response.status === 404) return undefined;
  if (!response.ok) throw new Error("Não foi possível consultar o código.");

  const data = (await response.json()) as { dns?: unknown };
  return typeof data.dns === "string" ? data.dns : undefined;
}
