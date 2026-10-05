import { useMemo, useState } from "react";
import { isSportsItem, parseMatch } from "../lib/catalog";
import type { MediaItem } from "../lib/types";

export function GamesView({ items, loading, error, onOpen }: { items: MediaItem[]; loading: boolean; error: string; onOpen: (item: MediaItem) => void }) {
  const [selected, setSelected] = useState("");
  const games = useMemo(() => items.filter(isSportsItem), [items]);
  const clock = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  return (
    <section className="games">
      <p className="games__clock">{clock}</p>
      {error ? <p className="status-line">{error}</p> : null}
      {loading ? <p className="status-line">Carregando jogos do dia…</p> : null}
      {!loading && !games.length ? <p className="status-line">Nenhum jogo encontrado na lista.</p> : null}
      {games.map((game) => {
        const match = parseMatch(game.name);
        return (
          <button
            key={game.id}
            className={`match ${selected === game.id ? "is-on" : ""}`}
            onClick={() => {
              setSelected(game.id);
              onOpen(game);
            }}
          >
            <small>{game.group}</small>
            <strong>
              {match ? `${match.home}  ×  ${match.away}` : game.name}
              <b>{match?.clock ? `hoje ${match.clock}` : "AO VIVO"}</b>
            </strong>
            <em>{game.group}</em>
          </button>
        );
      })}
    </section>
  );
}
