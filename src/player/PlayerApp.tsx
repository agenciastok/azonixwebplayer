import { useEffect, useRef, useState } from "react";
import { StageBackground } from "../components/StageBackground";
import { clearCatalog, isAdultItem, loadSection, loadSeriesDetails, loadVodDetails, newestFirst } from "../lib/catalog";
import { pushRecent, readFavorites, readPin, readRecents, writeFavorites, writePin } from "../lib/storage";
import type { MediaItem, SeriesDetails, Session } from "../lib/types";
import { AccountView } from "./AccountView";
import { BrowseView } from "./BrowseView";
import { GamesView } from "./GamesView";
import { HomeView } from "./HomeView";
import { KidsView } from "./KidsView";
import { LiveView } from "./LiveView";
import { PlayerOverlay } from "./PlayerOverlay";
import { SeriesDetail } from "./SeriesDetail";
import { Rail, type PlayerPage } from "./Rail";
import "./player.css";

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "Não foi possível carregar.";
}

export function PlayerApp({ session, onLogout }: { session: Session; onLogout: () => void }) {
  const [page, setPage] = useState<PlayerPage>("home");
  const [vod, setVod] = useState<MediaItem[]>([]);
  const [series, setSeries] = useState<MediaItem[]>([]);
  const [live, setLive] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [favorites, setFavorites] = useState(readFavorites);
  const [recents, setRecents] = useState(readRecents);
  const [pin, setPin] = useState(readPin);
  const [brandGroup, setBrandGroup] = useState<string>();
  const [hero, setHero] = useState<MediaItem | null>(null);
  const [playing, setPlaying] = useState<{ title: string; url: string; poster?: string; live?: boolean; plot?: string } | null>(null);
  const [openSeries, setOpenSeries] = useState<MediaItem | null>(null);
  const [seriesInfo, setSeriesInfo] = useState<SeriesDetails | null>(null);
  const [seriesLoading, setSeriesLoading] = useState(false);
  const [seriesError, setSeriesError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const seriesToken = useRef(0);

  useEffect(() => {
    let cancel = false;
    async function run() {
      setError("");
      setLoading(true);
      try {
        if (page === "home" || page === "kids") {
          const [movies, shows] = await Promise.all([loadSection(session, "vod"), loadSection(session, "series")]);
          if (cancel) return;
          setVod(movies);
          setSeries(shows);
        } else if (page === "movies") {
          setVod(await loadSection(session, "vod"));
        } else if (page === "series") {
          setSeries(await loadSection(session, "series"));
        } else if (page === "live" || page === "games") {
          setLive(await loadSection(session, "live"));
        }
      } catch (loadError) {
        if (!cancel) setError(messageFrom(loadError));
      } finally {
        if (!cancel) setLoading(false);
      }
    }
    void run();
    return () => {
      cancel = true;
    };
  }, [page, session, reloadKey]);

  useEffect(() => {
    const featured = newestFirst(vod.filter((item) => !pin || !isAdultItem(item)))[0];
    if (!featured) {
      setHero(null);
      return;
    }
    let cancel = false;
    setHero(featured);
    void loadVodDetails(session, featured).then((details) => {
      if (!cancel) setHero({ ...featured, ...details });
    });
    return () => {
      cancel = true;
    };
  }, [vod, session, pin]);

  function toggleFavorite(id: string) {
    const next = favorites.includes(id) ? favorites.filter((item) => item !== id) : [id, ...favorites];
    setFavorites(next);
    writeFavorites(next);
  }

  function play(media: { title: string; url: string; poster?: string; live?: boolean; plot?: string }, id?: string) {
    if (!media.url) return;
    setPlaying(media);
    if (id) setRecents(pushRecent(id));
  }

  async function openItem(item: MediaItem) {
    if (item.kind === "series") {
      const token = ++seriesToken.current;
      setOpenSeries(item);
      setSeriesInfo(null);
      setSeriesError("");
      setSeriesLoading(true);
      try {
        const details = await loadSeriesDetails(session, item);
        if (seriesToken.current !== token) return;
        setSeriesInfo(details);
      } catch (loadError) {
        if (seriesToken.current !== token) return;
        setSeriesError(messageFrom(loadError));
      } finally {
        if (seriesToken.current === token) setSeriesLoading(false);
      }
      return;
    }
    play({ title: item.name, url: item.url, poster: item.logo, live: item.kind === "live", plot: item.plot }, item.id);
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (playing) setPlaying(null);
      else if (openSeries) setOpenSeries(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playing, openSeries]);

  return (
    <div className="shell">
      <StageBackground />
      <Rail
        page={page}
        onChange={(next) => {
          setBrandGroup(undefined);
          setPage(next);
        }}
        onRefresh={() => {
          clearCatalog();
          setReloadKey((value) => value + 1);
        }}
      />
      <main className="shell__main">
        {page === "home" ? (
          <HomeView
            hero={hero}
            movies={newestFirst(vod)}
            series={newestFirst(series)}
            onOpen={openItem}
            loading={loading}
            error={error}
            onBrand={(next, group) => {
              setBrandGroup(group);
              setPage(next);
            }}
          />
        ) : null}
        {page === "movies" ? (
          <BrowseView
            kindLabel="filmes"
            searchLabel="Buscar Filmes"
            items={vod}
            loading={loading}
            error={error}
            favorites={favorites}
            recents={recents}
            requestedGroup={brandGroup}
            hideAdult={Boolean(pin)}
            onOpen={openItem}
          />
        ) : null}
        {page === "series" ? (
          <BrowseView
            kindLabel="séries"
            searchLabel="Buscar Series"
            items={series}
            loading={loading}
            error={error}
            favorites={favorites}
            recents={recents}
            hideAdult={Boolean(pin)}
            onOpen={openItem}
          />
        ) : null}
        {page === "live" ? (
          <LiveView items={live} loading={loading} error={error} favorites={favorites} hideAdult={Boolean(pin)} suspended={Boolean(playing)} onOpen={openItem} onToggleFavorite={toggleFavorite} />
        ) : null}
        {page === "kids" ? <KidsView items={[...vod, ...series]} loading={loading} error={error} onOpen={openItem} /> : null}
        {page === "games" ? <GamesView items={live} loading={loading} error={error} onOpen={openItem} /> : null}
        {page === "account" ? (
          <AccountView
            session={session}
            pin={pin}
            onPin={(value) => {
              writePin(value);
              setPin(value);
            }}
            onClearCache={() => {
              clearCatalog();
              setVod([]);
              setSeries([]);
              setLive([]);
              setReloadKey((value) => value + 1);
            }}
            onLogout={onLogout}
          />
        ) : null}
      </main>
      {openSeries ? (
        <SeriesDetail
          key={openSeries.id}
          item={openSeries}
          details={seriesInfo}
          loading={seriesLoading}
          error={seriesError}
          favorite={favorites.includes(openSeries.id)}
          onToggleFavorite={() => toggleFavorite(openSeries.id)}
          onClose={() => setOpenSeries(null)}
          onPlay={(episode) => play({
            title: episode.title,
            url: episode.url,
            poster: episode.image || openSeries.logo,
            plot: episode.plot,
          }, openSeries.id)}
        />
      ) : null}
      {playing ? (
        <PlayerOverlay
          title={playing.title}
          url={playing.url}
          poster={playing.poster}
          live={playing.live}
          plot={playing.plot}
          onClose={() => setPlaying(null)}
        />
      ) : null}
    </div>
  );
}
