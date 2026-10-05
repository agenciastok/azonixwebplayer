// Fallback local. Com o Supabase configurado, o login consulta a função resolve-code.
export const DNS_BY_CODE: Record<string, string> = {
  "0101": "http://slimflixtv.shop",
};

export function dnsForCode(code: string) {
  return DNS_BY_CODE[code.trim()];
}
