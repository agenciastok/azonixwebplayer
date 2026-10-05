import { FormEvent, ReactNode, useState } from "react";
import { StageBackground } from "../components/StageBackground";
import { authenticate } from "../lib/catalog";
import type { Session } from "../lib/types";
import "../components/StageBackground.css";
import "./LoginScreen.css";

type FieldProps = {
  name: string;
  label: string;
  type?: string;
  value: string;
  autoComplete?: string;
  icon: ReactNode;
  onChange: (value: string) => void;
};

function Field({ name, label, type = "text", value, autoComplete, icon, onChange }: FieldProps) {
  return (
    <label className="field" htmlFor={name}>
      <span className="field__icon" aria-hidden="true">
        {icon}
      </span>
      <span className="field__rule" aria-hidden="true" />
      <input
        id={name}
        name={name}
        type={type}
        placeholder={label}
        aria-label={label}
        value={value}
        autoComplete={autoComplete}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function CodeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 8 5 12l4 4" />
      <path d="m14.2 7.2-3.4 9.6" />
      <path d="m15 8 4 4-4 4" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="3.1" />
      <path d="M6.2 18.7c.8-3.1 2.85-4.6 5.8-4.6s5 1.5 5.8 4.6" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="6.2" y="10.7" width="11.6" height="8.2" rx="1.6" />
      <path d="M8.5 10.7V8.2a3.5 3.5 0 0 1 7 0v2.5" />
    </svg>
  );
}

export function LoginScreen({ onSuccess }: { onSuccess: (session: Session) => void }) {
  const [code, setCode] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      onSuccess(await authenticate(code, username, password));
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Não foi possível entrar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <StageBackground />
      <div className="login-card">
        <form className="login-card__form" onSubmit={handleSubmit}>
          <div className="login-card__brand">
            <img src="/brand/azonix-play.png" alt="AZONIX PLAY" className="login-card__logo" />
          </div>
          <h1 className="login-card__title">Entre na sua conta</h1>
          <div className="login-card__fields">
            <Field name="code" label="Código" value={code} autoComplete="off" icon={<CodeIcon />} onChange={setCode} />
            <Field
              name="username"
              label="Usuário"
              value={username}
              autoComplete="username"
              icon={<UserIcon />}
              onChange={setUsername}
            />
            <Field
              name="password"
              label="Senha"
              type="password"
              value={password}
              autoComplete="current-password"
              icon={<LockIcon />}
              onChange={setPassword}
            />
            {error ? <p className="login-card__error">{error}</p> : null}
            <button className="login-card__submit" type="submit" disabled={busy}>
              {busy ? "ENTRANDO" : "LOGIN"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
