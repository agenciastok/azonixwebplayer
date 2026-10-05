import type { MediaItem } from "../lib/types";
import { CoverImage } from "./CoverImage";

export function Poster({ item, onOpen }: { item: MediaItem; onOpen: (item: MediaItem) => void }) {
  return (
    <button className="poster" onClick={() => onOpen(item)}>
      <CoverImage url={item.logo} alt="" />
      <span className="caption">{item.name}</span>
    </button>
  );
}

export function PosterGrid({ items, onOpen }: { items: MediaItem[]; onOpen: (item: MediaItem) => void }) {
  if (!items.length) return <p className="status-line">Nenhum conteúdo nesta pasta.</p>;
  return (
    <div className="poster-grid">
      {items.map((item) => (
        <Poster key={item.id} item={item} onOpen={onOpen} />
      ))}
    </div>
  );
}
