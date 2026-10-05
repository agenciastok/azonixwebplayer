import { useEffect, useMemo, useRef, useState } from "react";
import { groupsInOrder, isAdultItem } from "../lib/catalog";
import type { MediaItem } from "../lib/types";
import { CoverImage } from "./CoverImage";
import { MiniPlayer } from "./MiniPlayer";

type LiveProps = {
  items: MediaItem[];
  loading: boolean;
  error: string;
  favorites: string[];
  hideAdult: boolean;
  suspended: boolean;
  onOpen: (item: MediaItem) => void;
  onToggleFavorite: (id: string) => void;
};

export function LiveView({ items, loading, error, favorites, hideAdult, suspended, onOpen, onToggleFavorite }: LiveProps) {
  const [query, setQuery] = useState("");
  const [folder, setFolder] = useState("Lista de Canais");
  const [selected, setSelected] = useState("");
  const [preview, setPreview] = useState<MediaItem | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [windowed, setWindowed] = useState({ start: 0, end: 40 });
  const rowHeight = 60;
  const visible = hideAdult ? items.filter((item) => !isAdultItem(item)) : items;
  const folders = useMemo(() => groupsInOrder(visible), [visible]);
  const channels = useMemo(() => {
    const named = visible.filter((item) => item.name.toLowerCase().includes(query.trim().toLowerCase()));
    if (folder === "Favoritos") return named.filter((item) => favorites.includes(item.id));
    if (folder === "Lista de Canais") return named;
    return named.filter((item) => item.group === folder);
  }, [visible, folder, query, favorites]);
  const shown = channels.slice(windowed.start, windowed.end);

  useEffect(() => {
    const node = listRef.current;
    if (!node) return;
    node.scrollTop = 0;
    const update = () => {
      const start = Math.max(0, Math.floor(node.scrollTop / rowHeight) - 8);
      const end = Math.min(channels.length, start + Math.ceil(node.clientHeight / rowHeight) + 16);
      setWindowed((current) => (current.start === start && current.end === end ? current : { start, end }));
    };
    update();
    node.addEventListener("scroll", update, { passive: true });
    return () => node.removeEventListener("scroll", update);
  }, [channels.length, folder, query, rowHeight]);

  function choose(channel: MediaItem) {
    setSelected(channel.id);
    if (preview?.id === channel.id) {
      onOpen(channel);
      return;
    }
    setPreview(channel);
  }

  return (
    <section className="live">
      <aside className="live__side">
        <label className="side__search">
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input value={query} placeholder="Buscar" onChange={(event) => setQuery(event.target.value)} />
        </label>
        <button className={`live__cat ${folder === "Favoritos" ? "is-on" : ""}`} onClick={() => setFolder("Favoritos")}>★ Favoritos</button>
        <button className={`live__cat ${folder === "Lista de Canais" ? "is-on" : ""}`} onClick={() => setFolder("Lista de Canais")}>☰ Lista de Canais</button>
        {folders.map((group) => (
          <button key={group} className={`live__cat ${folder === group ? "is-on" : ""}`} onClick={() => setFolder(group)}>{group}</button>
        ))}
      </aside>
      <div className="live__list" ref={listRef}>
        <div className="live__head"><span>Lista de Canais</span><span>{loading ? "…" : `${channels.length} canais`}</span></div>
        {error ? <p className="status-line">{error}</p> : null}
        {loading ? <p className="status-line">Carregando canais…</p> : null}
        <div style={{ height: windowed.start * rowHeight }} />
        {shown.map((channel, index) => (
          <button
            key={channel.id}
            className={`channel ${selected === channel.id ? "is-on" : ""}`}
            onClick={() => choose(channel)}
          >
            <span>{windowed.start + index + 1}</span>
            <CoverImage className="channel__logo" url={channel.logo} alt="" />
            <b>{channel.name}</b>
            <span aria-label="Favorito" onClick={(event) => { event.stopPropagation(); onToggleFavorite(channel.id); }}>
              {favorites.includes(channel.id) ? "★" : "☆"}
            </span>
          </button>
        ))}
        <div style={{ height: Math.max(0, channels.length - windowed.end) * rowHeight }} />
        <div className="live__foot">
          <span>Menu</span><span>Fav</span><span>Ordenar</span><span>Anterios</span><span>Bloquear</span>
        </div>
      </div>
      <MiniPlayer item={preview} suspended={suspended} onExpand={() => preview && onOpen(preview)} />
    </section>
  );
}
