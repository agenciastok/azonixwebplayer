import { useState } from "react";
import type { Session } from "../lib/types";

type AccountTab = "conta" | "parental" | "cache" | "sobre";

type AccountProps = {
  session: Session;
  pin: string;
  onPin: (pin: string) => void;
  onClearCache: () => void;
  onLogout: () => void;
};

export function AccountView({ session, pin, onPin, onClearCache, onLogout }: AccountProps) {
  const [tab, setTab] = useState<AccountTab>("conta");
  const [draft, setDraft] = useState(pin);

  return (
    <section className="account">
      <div className="account__menu">
        <button className={tab === "conta" ? "is-on" : ""} onClick={() => setTab("conta")}>Conta</button>
        <button className={tab === "parental" ? "is-on" : ""} onClick={() => setTab("parental")}>Definir Controle Parental</button>
        <button className={tab === "cache" ? "is-on" : ""} onClick={() => setTab("cache")}>Limpar Cache</button>
        <button className={tab === "sobre" ? "is-on" : ""} onClick={() => setTab("sobre")}>Sobre</button>
      </div>
      <div className="account__card">
        {tab === "conta" ? (
          <>
            <h1>Informações da Conta</h1>
            <p className="account__row">Usuario: {session.account.username}</p>
            <p className="account__row">Plano : {session.account.plan}</p>
            <p className="account__row">Expiracao: {session.account.expDate}</p>
            <button className="account__logout" onClick={onLogout}>Deslogar</button>
          </>
        ) : null}
        {tab === "parental" ? (
          <form
            className="parental"
            onSubmit={(event) => {
              event.preventDefault();
              onPin(draft.trim());
            }}
          >
            <h1>Controle parental</h1>
            <p>Defina um PIN para ocultar pastas adultas. Deixe vazio para desligar.</p>
            <input value={draft} inputMode="numeric" maxLength={6} onChange={(event) => setDraft(event.target.value)} placeholder="PIN" />
            <button type="submit">Salvar</button>
          </form>
        ) : null}
        {tab === "cache" ? (
          <>
            <h1>Limpar Cache</h1>
            <p>Apaga a lista já baixada neste navegador. A próxima página busca de novo só o que for aberto.</p>
            <button className="account__logout" onClick={onClearCache}>Limpar agora</button>
          </>
        ) : null}
        {tab === "sobre" ? (
          <>
            <h1>AZONIX PLAY</h1>
            <p>Webplayer IPTV. As pastas seguem a ordem da lista.</p>
          </>
        ) : null}
      </div>
    </section>
  );
}
