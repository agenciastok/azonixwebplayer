import { useMemo, useState } from "react";
import { isKidsItem } from "../lib/catalog";
import type { MediaItem } from "../lib/types";
import { PosterGrid } from "./Poster";

export function KidsView({ items, loading, error, onOpen }: { items: MediaItem[]; loading: boolean; error: string; onOpen: (item: MediaItem) => void }) {
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(48);
  const kids = useMemo(
    () => items.filter((item) => isKidsItem(item) && item.name.toLowerCase().includes(query.trim().toLowerCase())),
    [items, query],
  );

  return (
    <section className="kids">
      <aside>
        <div className="kids__panel">
          <h2>KIDS</h2>
          <label className="kids__search">
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input value={query} placeholder="Buscar Filmes" onChange={(event) => setQuery(event.target.value)} />
          </label>
          <button className="kids__chip">Filmes - Animação..</button>
        </div>
      </aside>
      <div
        className="kids__main"
        onScroll={(event) => {
          const node = event.currentTarget;
          if (node.scrollTop + node.clientHeight > node.scrollHeight - 480) setLimit((value) => value + 48);
        }}
      >
        <div className="browse__total">TOTAL/ {loading ? "…" : kids.length}</div>
        {error ? <p className="status-line">{error}</p> : null}
        {loading ? <p className="status-line">Carregando infantil…</p> : <PosterGrid items={kids.slice(0, limit)} onOpen={onOpen} />}
      </div>
    </section>
  );
}
