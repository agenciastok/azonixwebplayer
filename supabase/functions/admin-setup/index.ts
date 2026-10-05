import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método inválido." }, 405);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { count, error: countError } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "admin");

  if (countError) return json({ error: "Não foi possível verificar o painel." }, 500);

  let body: { action?: string; email?: string; password?: string } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  if (body.action === "status") {
    return json({ hasAdmin: (count ?? 0) > 0 });
  }

  if (body.action !== "create") return json({ error: "Ação inválida." }, 400);
  if ((count ?? 0) > 0) {
    return json({ error: "O administrador já existe. Entre com e-mail e senha." }, 403);
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8) {
    return json({ error: "Use um e-mail válido e uma senha com pelo menos 8 caracteres." }, 400);
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) {
    return json({ error: "Não foi possível criar o administrador." }, 400);
  }

  const { error: roleError } = await supabase
    .from("profiles")
    .update({ role: "admin" })
    .eq("id", data.user.id);

  if (roleError) {
    return json({ error: "Conta criada, mas o papel de administrador não foi aplicado." }, 500);
  }

  return json({ ok: true });
});
