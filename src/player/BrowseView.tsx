import { useEffect, useMemo, useState } from "react";
import { groupsInOrder, isAdultItem, newestFirst } from "../lib/catalog";
import type { MediaItem } from "../lib/types";
import { PosterGrid } from "./Poster";

type BrowseProps = {
  kindLabel: string;
  searchLabel: string;
  items: MediaItem[];
  loading: boolean;
  error: string;
  favorites: string[];
  recents: string[];
  requestedGroup?: string;
  hideAdult: boolean;
  onOpen: (item: MediaItem) => void;
};

const VIRTUAL = ["FAVORITOS", "RECENTES", "RECÉM ADICIONADOS"] as const;

export function BrowseView({ kindLabel, searchLabel, items, loading, error, favorites, recents, requestedGroup, hideAdult, onOpen }: BrowseProps) {
  const [query, setQuery] = useState("");
  const [folder, setFolder] = useState<(typeof VIRTUAL)[number] | string>("RECÉM ADICIONADOS");
  const [limit, setLimit] = useState(40);
  const visibleItems = hideAdult ? items.filter((item) => !isAdultItem(item)) : items;
  const folders = useMemo(() => groupsInOrder(visibleItems), [visibleItems]);

  useEffect(() => {
    if (!requestedGroup) return;
    const found = folders.find((group) => new RegExp(requestedGroup, "i").test(group));
    if (found) setFolder(found);
  }, [requestedGroup, folders]);

  useEffect(() => {
    setLimit(40);
  }, [folder, query]);

  const filtered = useMemo(() => {
    const byName = (list: MediaItem[]) => list.filter((item) => item.name.toLowerCase().includes(query.trim().toLowerCase()));
    if (folder === "FAVORITOS") return byName(visibleItems.filter((item) => favorites.includes(item.id)));
    if (folder === "RECENTES") {
      const map = new Map(visibleItems.map((item) => [item.id, item]));
      return byName(recents.map((id) => map.get(id)).filter((item): item is MediaItem => Boolean(item)));
    }
    if (folder === "RECÉM ADICIONADOS") return byName(newestFirst(visibleItems));
    return byName(visibleItems.filter((item) => item.group === folder));
  }, [folder, query, visibleItems, favorites, recents]);

  return (
    <section className="browse">
      <aside className="side">
        <label className="side__search">
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input value={query} placeholder={searchLabel} onChange={(event) => setQuery(event.target.value)} />
        </label>
        <div className="folder-row">
          {VIRTUAL.map((name) => (
            <button key={name} className={`cat ${folder === name ? "is-on" : ""}`} onClick={() => setFolder(name)}>
              {name === "FAVORITOS" ? "♥  FAVORITOS" : name}
            </button>
          ))}
          {folders.map((group) => (
            <button key={group} className={`cat ${folder === group ? "is-on" : ""}`} onClick={() => setFolder(group)}>
              ◆ {group}
            </button>
          ))}
        </div>
      </aside>
      <div
        className="browse__main"
        onScroll={(event) => {
          const node = event.currentTarget;
          if (node.scrollTop + node.clientHeight > node.scrollHeight - 480) setLimit((value) => value + 40);
        }}
      >
        <div className="browse__total">TOTAL/ {loading ? "…" : filtered.length}</div>
        {error ? <p className="status-line">{error}</p> : null}
        {loading ? <p className="status-line">Carregando {kindLabel}…</p> : <PosterGrid items={filtered.slice(0, limit)} onOpen={onOpen} />}
      </div>
    </section>
  );
}
