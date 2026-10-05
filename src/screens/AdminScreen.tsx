import { FormEvent, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { functionHeaders, functionUrl, supabase } from "../lib/supabase";
import "./AdminScreen.css";

type PlayerCode = {
  id: number;
  code: string;
  dns: string;
  label: string | null;
  active: boolean;
};

const emptyForm = { code: "", dns: "http://", label: "" };

export function AdminScreen() {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [hasAdmin, setHasAdmin] = useState<boolean | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [codes, setCodes] = useState<PlayerCode[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supabase) {
      setReady(true);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!ready || session || !supabase) return;
    fetch(functionUrl("admin-setup"), {
      method: "POST",
      headers: functionHeaders(),
      body: JSON.stringify({ action: "status" }),
    })
      .then((response) => response.json())
      .then((data: { hasAdmin?: boolean }) => setHasAdmin(Boolean(data.hasAdmin)))
      .catch(() => setError("Não foi possível consultar o painel."));
  }, [ready, session]);

  useEffect(() => {
    if (!session) return;
    loadCodes().catch((loadError: unknown) => {
      setError(loadError instanceof Error ? loadError.message : "Não foi possível carregar os códigos.");
    });
  }, [session]);

  async function loadCodes() {
    if (!supabase) return;
    const { data, error: loadError } = await supabase
      .from("webplayer_codes")
      .select("id, code, dns, label, active")
      .order("code");
    if (loadError) throw new Error("Esta conta não administra os códigos.");
    setCodes((data ?? []) as PlayerCode[]);
  }

  async function signIn(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError("");
    const { error: signError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(false);
    if (signError) setError("E-mail ou senha inválidos.");
  }

  async function createAdmin(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError("");
    const response = await fetch(functionUrl("admin-setup"), {
      method: "POST",
      headers: functionHeaders(),
      body: JSON.stringify({ action: "create", email: email.trim(), password }),
    });
    const data = (await response.json()) as { error?: string };
    if (!response.ok) {
      setBusy(false);
      setError(data.error || "Não foi possível criar o administrador.");
      return;
    }
    const { error: signError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(false);
    if (signError) setError("Administrador criado. Entre com o e-mail e a senha.");
  }

  async function saveCode(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    const code = form.code.trim();
    const dns = form.dns.trim();
    const label = form.label.trim();
    if (!/^[0-9A-Za-z][0-9A-Za-z-]{0,30}$/.test(code)) {
      setError("O código usa letras, números ou hífen, até 31 caracteres.");
      return;
    }
    if (!/^https?:\/\/\S+$/i.test(dns)) {
      setError("A DNS precisa começar com http:// ou https://.");
      return;
    }
    setBusy(true);
    setError("");
    const payload = { code, dns, label: label || null };
    const query = editingId
      ? supabase.from("webplayer_codes").update(payload).eq("id", editingId)
      : supabase.from("webplayer_codes").insert(payload);
    const { error: saveError } = await query;
    setBusy(false);
    if (saveError) {
      setError(saveError.code === "23505" ? "Esse código já existe." : "Não foi possível salvar o código.");
      return;
    }
    setForm(emptyForm);
    setEditingId(null);
    await loadCodes();
  }

  async function toggleCode(row: PlayerCode) {
    if (!supabase) return;
    setError("");
    const { error: updateError } = await supabase
      .from("webplayer_codes")
      .update({ active: !row.active })
      .eq("id", row.id);
    if (updateError) {
      setError("Não foi possível atualizar o código.");
      return;
    }
    await loadCodes();
  }

  async function removeCode(row: PlayerCode) {
    if (!supabase || !window.confirm(`Excluir o código ${row.code}?`)) return;
    setError("");
    const { error: deleteError } = await supabase.from("webplayer_codes").delete().eq("id", row.id);
    if (deleteError) {
      setError("Não foi possível excluir o código.");
      return;
    }
    if (editingId === row.id) {
      setEditingId(null);
      setForm(emptyForm);
    }
    await loadCodes();
  }

  function editCode(row: PlayerCode) {
    setEditingId(row.id);
    setForm({ code: row.code, dns: row.dns, label: row.label ?? "" });
    setError("");
  }

  if (!supabase) {
    return (
      <main className="admin">
        <p className="admin__error">O painel ainda não tem as chaves do Supabase.</p>
      </main>
    );
  }

  if (!ready) {
    return (
      <main className="admin">
        <p className="admin__muted">Carregando…</p>
      </main>
    );
  }

  const client = supabase;

  if (!session && hasAdmin === null) {
    return (
      <main className="admin">
        <p className="admin__muted">Carregando…</p>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="admin">
        <form className="admin__gate" onSubmit={hasAdmin ? signIn : createAdmin}>
          <p className="admin__brand">AZONIX PLAY</p>
          <h1>{hasAdmin ? "Painel de códigos" : "Criar administrador"}</h1>
          <p className="admin__muted">
            {hasAdmin
              ? "Entre para cadastrar códigos e DNS."
              : "Este é o primeiro acesso. A conta criada aqui administra os códigos."}
          </p>
          <label>
            E-mail
            <input type="email" value={email} autoComplete="username" onChange={(event) => setEmail(event.target.value)} required />
          </label>
          <label>
            Senha
            <input
              type="password"
              value={password}
              autoComplete={hasAdmin ? "current-password" : "new-password"}
              minLength={hasAdmin ? undefined : 8}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          {error ? <p className="admin__error">{error}</p> : null}
          <button type="submit" disabled={busy}>
            {busy ? "Aguarde" : hasAdmin ? "Entrar" : "Criar administrador"}
          </button>
          <a href="/">Voltar ao player</a>
        </form>
      </main>
    );
  }

  return (
    <main className="admin">
      <header className="admin__bar">
        <div>
          <p className="admin__brand">AZONIX PLAY</p>
          <h1>Códigos e DNS</h1>
        </div>
        <div className="admin__bar-actions">
          <a href="/">Player</a>
          <button
            type="button"
            onClick={() => {
              client.auth.signOut();
              setCodes([]);
            }}
          >
            Sair
          </button>
        </div>
      </header>

      <form className="admin__form" onSubmit={saveCode}>
        <label>
          Código
          <input value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} required />
        </label>
        <label>
          DNS
          <input value={form.dns} onChange={(event) => setForm({ ...form, dns: event.target.value })} required />
        </label>
        <label>
          Nome
          <input value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })} />
        </label>
        <div className="admin__form-actions">
          <button type="submit" disabled={busy}>
            {editingId ? "Salvar" : "Adicionar"}
          </button>
          {editingId ? (
            <button
              type="button"
              className="admin__ghost"
              onClick={() => {
                setEditingId(null);
                setForm(emptyForm);
              }}
            >
              Cancelar
            </button>
          ) : null}
        </div>
      </form>
      {error ? <p className="admin__error">{error}</p> : null}

      <div className="admin__table-wrap">
        <table className="admin__table">
          <thead>
            <tr>
              <th>Código</th>
              <th>DNS</th>
              <th>Nome</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {codes.map((row) => (
              <tr key={row.id}>
                <td>{row.code}</td>
                <td>{row.dns}</td>
                <td>{row.label || "—"}</td>
                <td>{row.active ? "Ativo" : "Inativo"}</td>
                <td className="admin__row-actions">
                  <button type="button" onClick={() => editCode(row)}>
                    Editar
                  </button>
                  <button type="button" onClick={() => toggleCode(row)}>
                    {row.active ? "Desativar" : "Ativar"}
                  </button>
                  <button type="button" onClick={() => removeCode(row)}>
                    Excluir
                  </button>
                </td>
              </tr>
            ))}
            {codes.length === 0 ? (
              <tr>
                <td colSpan={5}>Nenhum código cadastrado.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </main>
  );
}
