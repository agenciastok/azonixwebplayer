import { useState } from "react";
import { PlayerApp } from "./player/PlayerApp";
import { AdminScreen } from "./screens/AdminScreen";
import { LoginScreen } from "./screens/LoginScreen";
import { clearCatalog } from "./lib/catalog";
import { clearSession, readSession } from "./lib/session";
import type { Session } from "./lib/types";

export default function App() {
  const [session, setSession] = useState<Session | null>(() => readSession());

  if (window.location.pathname.replace(/\/$/, "") === "/admin") return <AdminScreen />;
  if (!session) return <LoginScreen onSuccess={setSession} />;

  return (
    <PlayerApp
      session={session}
      onLogout={() => {
        clearSession();
        clearCatalog();
        setSession(null);
      }}
    />
  );
}
