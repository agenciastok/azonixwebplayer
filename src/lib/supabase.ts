import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null;

export function functionUrl(name: string) {
  return `${url}/functions/v1/${name}`;
}

export function functionHeaders() {
  return {
    "Content-Type": "application/json",
    apikey: key ?? "",
  };
}
