import { proxiedImage } from "../lib/proxy";
import type { MediaItem } from "../lib/types";
import { CoverImage } from "./CoverImage";
import type { PlayerPage } from "./Rail";

const brands: Array<{ label: string; className: string; match: RegExp; page?: PlayerPage }> = [
  { label: "KIDS", className: "brand--kids", match: /kids|infantil/i, page: "kids" },
  { label: "NETFLIX", className: "brand--netflix", match: /netflix/i },
  { label: "prime video", className: "brand--prime", match: /prime/i },
  { label: "Apple TV+", className: "brand--apple", match: /apple/i },
  { label: "Disney+", className: "brand--disney", match: /disney/i },
  { label: "STAR+", className: "brand--star", match: /star\s*\+/i },
  { label: "globoplay", className: "brand--globo", match: /globo/i },
];

type HomeProps = {
  hero: MediaItem | null;
  movies: MediaItem[];
  series: MediaItem[];
  onOpen: (item: MediaItem) => void;
  onBrand: (page: PlayerPage, group?: string) => void;
  loading: boolean;
  error: string;
};

export function HomeView({ hero, movies, series, onOpen, onBrand, loading, error }: HomeProps) {
  return (
    <div className="home">
      {loading ? <p className="status-line">Carregando destaques…</p> : null}
      {error ? <p className="status-line">{error}</p> : null}
      <section className="hero">
        <div>
          <h1>{hero?.name || "AZONIX PLAY"}</h1>
          <p><b>Direção:</b> {hero?.director || "—"}</p>
          <p><b>Duração:</b> <span className="pill">{hero?.duration || "—"}</span></p>
          <p><b>Gênero:</b> {hero?.genre || hero?.group || "—"}</p>
          <p><b>Elenco:</b> {hero?.cast || "—"}</p>
          <p><b>Descricao</b></p>
          <p className="hero__plot">{hero?.plot || "Abra um filme para ver a sinopse completa."}</p>
        </div>
        <button className="hero__art" style={{ backgroundImage: hero?.logo ? `url("${proxiedImage(hero.logo)}")` : undefined }} onClick={() => hero && onOpen(hero)} aria-label={hero?.name || "Destaque"} />
      </section>
      <h2>Escolha seu Streaming</h2>
      <div className="brands">
        {brands.map((brand) => (
          <button
            key={brand.label}
            className={brand.className}
            onClick={() => onBrand(brand.page ?? "movies", brand.page ? undefined : brand.match.source)}
          >
            {brand.label === "prime video" ? <span>prime video</span> : brand.label}
          </button>
        ))}
      </div>
      <h2>Top Filmes Recem Adicionados</h2>
      <Ranked items={movies.slice(0, 6)} onOpen={onOpen} />
      <h2>Top Séries Recem Adicionadas</h2>
      <Ranked items={series.slice(0, 6)} onOpen={onOpen} />
    </div>
  );
}

function Ranked({ items, onOpen }: { items: MediaItem[]; onOpen: (item: MediaItem) => void }) {
  if (!items.length) return <p className="status-line">Nada por aqui ainda.</p>;
  return (
    <div className="tops">
      {items.map((item, index) => (
        <button key={item.id} className="rank" onClick={() => onOpen(item)}>
          <strong>{index + 1}</strong>
          <span>
            <CoverImage url={item.logo} alt="" />
            <em className="caption">{item.name}</em>
          </span>
        </button>
      ))}
    </div>
  );
}
