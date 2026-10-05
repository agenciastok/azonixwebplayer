import { useMemo, useState } from "react";
import type { MediaItem, SeriesDetails, SeriesEpisode } from "../lib/types";
import { CoverImage } from "./CoverImage";

function shown(value: string) {
  const text = value.trim();
  if (!text || text.toLowerCase() === "null" || text.toLowerCase() === "undefined") return "—";
  return text;
}

function titleWithYear(name: string, releaseDate: string) {
  const fromDate = /((?:19|20)\d{2})/.exec(releaseDate)?.[1];
  const fromName = /\b((?:19|20)\d{2})\s*$/.exec(name)?.[1];
  const year = fromDate || fromName;
  if (!year || name.includes(`(${year})`)) return name;
  return `${name} (${year})`;
}

function starCount(rating: string) {
  const value = Number(rating.replace(",", "."));
  if (!Number.isFinite(value) || value <= 0) return 0;
  const five = value > 5 ? value / 2 : value;
  return Math.max(0, Math.min(5, Math.round(five)));
}

function Stars({ rating, tone }: { rating: string; tone: "light" | "blue" }) {
  const filled = starCount(rating);
  return (
    <span className={`stars stars--${tone}`} aria-label={`${filled} de 5`}>
      {[1, 2, 3, 4, 5].map((index) => (
        <span key={index} className={index <= filled ? "is-on" : ""}>{index <= filled ? "★" : "☆"}</span>
      ))}
    </span>
  );
}

export function SeriesDetail({
  item,
  details,
  loading,
  error,
  favorite,
  onToggleFavorite,
  onPlay,
  onClose,
}: {
  item: MediaItem;
  details: SeriesDetails | null;
  loading: boolean;
  error: string;
  favorite: boolean;
  onToggleFavorite: () => void;
  onPlay: (episode: SeriesEpisode) => void;
  onClose: () => void;
}) {
  const info = details;
  const seasons = useMemo(() => {
    const numbers = [...new Set((info?.episodes ?? []).map((episode) => episode.season))].sort((a, b) => a - b);
    return numbers.length ? numbers : [];
  }, [info]);
  const [season, setSeason] = useState<number | null>(null);
  const [trailerNote, setTrailerNote] = useState("");
  const activeSeason = season ?? seasons[0] ?? 1;
  const episodes = (info?.episodes ?? []).filter((episode) => episode.season === activeSeason);
  const release = info?.releaseDate ?? "";

  function openTrailer() {
    if (!info?.trailer) {
      setTrailerNote("Trailer indisponível.");
      return;
    }
    setTrailerNote("");
    window.open(info.trailer, "_blank", "noopener,noreferrer");
  }

  return (
    <section className="series-detail">
      <button className="series-detail__back" onClick={onClose}>Voltar</button>
      <div className="series-detail__top">
        <CoverImage className="series-detail__poster" url={info?.cover || item.logo} alt="" />
        <div>
          <h1>{titleWithYear(info?.name || item.name, release)}</h1>
          <div className="series-detail__meta">
            <b>Direção:</b>
            <span>{shown(info?.director || "")}</span>
            <b>Data de Lançamento:</b>
            <span>{shown(release)}</span>
            <b>Gênero:</b>
            <span>{shown(info?.genre || item.group)}</span>
            <b>Descricao</b>
            <span>{shown(info?.plot || "")}</span>
          </div>
        </div>
      </div>
      <div className="series-detail__actions">
        <Stars rating={info?.rating || ""} tone="light" />
        <button className={`fav-btn ${favorite ? "is-on" : ""}`} onClick={onToggleFavorite}>
          <span aria-hidden="true">{favorite ? "♥" : "♡"}</span>
          FAVORITAR
        </button>
        <button className="trailer-btn" onClick={openTrailer}>
          <span className="trailer-btn__icon" aria-hidden="true">▶</span>
          TRAILER
        </button>
        {trailerNote ? <span className="series-detail__note">{trailerNote}</span> : null}
      </div>
      {loading ? <p className="status-line">Carregando episódios…</p> : null}
      {error ? <p className="status-line">{error}</p> : null}
      {seasons.length ? (
        <div className="seasons">
          {seasons.map((number) => (
            <button key={number} className={number === activeSeason ? "is-on" : ""} onClick={() => setSeason(number)}>
              Temporada {number}
            </button>
          ))}
        </div>
      ) : null}
      <div className="episodes">
        {episodes.map((episode) => (
          <button key={episode.id} className="episode" onClick={() => onPlay(episode)}>
            <span className="episode__thumb">
              <CoverImage url={episode.image || info?.cover || item.logo} alt="" />
              <span className="episode__play" aria-hidden="true">▶</span>
            </span>
            <span className="episode__body">
              <strong>{episode.title}</strong>
              <Stars rating={episode.rating} tone="blue" />
              {episode.duration ? <em>{episode.duration}</em> : null}
              {episode.plot ? <span className="episode__plot">{episode.plot}</span> : null}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
