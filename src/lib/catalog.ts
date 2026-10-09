import { parseM3u } from "./m3u";
import { resolveDns } from "./resolveCode";
import { saveSession } from "./session";
import { vpsProxy } from "./vps";
import type { AccountInfo, CatalogSection, MediaItem, SeriesDetails, SeriesEpisode, Session } from "./types";

const cache = new Map<string, MediaItem[]>();
let m3uCache: { key: string; data: Awaited<ReturnType<typeof loadFromM3u>> } | null = null;

function baseOf(session: Session) {
  return session.dns.replace(/\/$/, "");
}

function authQuery(session: Session) {
  return `username=${encodeURIComponent(session.username)}&password=${encodeURIComponent(session.password)}`;
}

function isListRequest(url: string) {
  try {
    const path = new URL(url).pathname.toLowerCase();
    return path.endsWith("/player_api.php") || path.endsWith("/get.php");
  } catch {
    return false;
  }
}

async function fetchCatalog(url: string) {
  if (!isListRequest(url)) return fetch(url);
  return fetch(vpsProxy("playlist", url));
}

async function readJson(url: string) {
  let response: Response;
  try {
    response = await fetchCatalog(url);
  } catch {
    throw new Error("Não foi possível consultar a lista direto no servidor.");
  }
  const text = await response.text();
  if (!response.ok) {
    const detail = text.replace(/\s+/g, " ").trim();
    if (detail && detail.length < 240 && !detail.startsWith("<") && !detail.startsWith("{")) {
      throw new Error(detail);
    }
    throw new Error(`Falha ao acessar a lista (${response.status})`);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("NOT_JSON");
  }
}

function formatExp(value: string | number | null | undefined) {
  if (!value || value === "null") return "Sem expiração";
  const numeric = Number(value);
  const date = Number.isFinite(numeric) && numeric > 0 ? new Date(numeric * 1000) : new Date(String(value));
  if (Number.isNaN(date.getTime())) return "Sem expiração";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function accountFrom(payload: Record<string, unknown>, username: string): AccountInfo {
  const info = (payload.user_info ?? {}) as Record<string, unknown>;
  const trial = String(info.is_trial ?? "0") === "1";
  return {
    username: String(info.username || username),
    status: String(info.status || "Active"),
    expDate: formatExp(info.exp_date as string),
    plan: trial ? "Teste" : "Premium",
  };
}

export async function authenticate(code: string, username: string, password: string): Promise<Session> {
  const trimmedCode = code.trim();
  const trimmedUser = username.trim();
  if (!trimmedCode || !trimmedUser || !password) {
    throw new Error("Preencha código, usuário e senha.");
  }
  const dns = await resolveDns(trimmedCode);
  if (!dns) throw new Error("Código não encontrado.");

  const session: Session = {
    code: trimmedCode,
    dns,
    username: trimmedUser,
    password,
    account: { username: trimmedUser, status: "Active", expDate: "Sem expiração", plan: "Premium" },
  };

  try {
    const payload = (await readJson(`${baseOf(session)}/player_api.php?${authQuery(session)}`)) as Record<string, unknown>;
    const info = (payload.user_info ?? null) as Record<string, unknown> | null;
    if (!info || Number(info.auth ?? 1) === 0) {
      throw new Error("Usuário ou senha inválidos.");
    }
    session.account = accountFrom(payload, trimmedUser);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "Usuário ou senha inválidos.") throw error;
    if (message === "NOT_JSON" || message.includes("404")) {
      throw new Error("A DNS não retornou a lista. Confira se o endereço inclui a porta do servidor.");
    }
    throw new Error(error instanceof Error ? error.message : "Não foi possível entrar.");
  }

  saveSession(session);
  return session;
}

type XtreamCategory = { category_id?: string | number; category_name?: string };
type XtreamStream = {
  stream_id?: string | number;
  name?: string;
  stream_icon?: string;
  category_id?: string | number;
  added?: string | number;
  rating?: string | number;
  container_extension?: string;
  direct_source?: string;
};
type XtreamSeries = {
  series_id?: string | number;
  name?: string;
  cover?: string;
  category_id?: string | number;
  plot?: string;
  cast?: string;
  director?: string;
  genre?: string;
  rating?: string | number;
  last_modified?: string | number;
  episode_run_time?: string;
};

function mapCategories(categories: XtreamCategory[]) {
  const names = new Map<string, string>();
  const order = new Map<string, number>();
  categories.forEach((category, index) => {
    const id = String(category.category_id ?? index);
    names.set(id, category.category_name?.trim() || "Sem categoria");
    order.set(id, index);
  });
  return { names, order };
}

async function loadFromApi(session: Session, section: CatalogSection): Promise<MediaItem[]> {
  const base = baseOf(session);
  const query = authQuery(session);
  const categoryAction = section === "live" ? "get_live_categories" : section === "vod" ? "get_vod_categories" : "get_series_categories";
  const itemAction = section === "live" ? "get_live_streams" : section === "vod" ? "get_vod_streams" : "get_series";
  const [categories, items] = await Promise.all([
    readJson(`${base}/player_api.php?${query}&action=${categoryAction}`),
    readJson(`${base}/player_api.php?${query}&action=${itemAction}`),
  ]);
  if (!Array.isArray(categories) || !Array.isArray(items)) throw new Error("NOT_JSON");
  const mapped = mapCategories(categories as XtreamCategory[]);
  const user = encodeURIComponent(session.username);
  const pass = encodeURIComponent(session.password);

  return (items as Array<XtreamStream & XtreamSeries>).map((item, index) => {
    const categoryId = String(item.category_id ?? "");
    const group = mapped.names.get(categoryId) || "Sem categoria";
    const groupIndex = mapped.order.get(categoryId) ?? mapped.order.size + index;
    if (section === "series") {
      const seriesId = String(item.series_id ?? index);
      return {
        id: `series-${seriesId}`,
        seriesId,
        name: item.name?.trim() || "Sem nome",
        logo: item.cover || "",
        group,
        groupIndex,
        url: "",
        kind: "series",
        plot: item.plot || "",
        cast: item.cast || "",
        director: item.director || "",
        genre: item.genre || "",
        duration: item.episode_run_time || "",
        rating: String(item.rating ?? ""),
        added: Number(item.last_modified ?? 0),
      } satisfies MediaItem;
    }
    const streamId = String(item.stream_id ?? index);
    const extension = item.container_extension || "mp4";
    const direct = item.direct_source?.trim() || "";
    const url = /^https?:\/\//i.test(direct)
      ? direct
      : section === "live"
        ? `${base}/live/${user}/${pass}/${streamId}.m3u8`
        : `${base}/movie/${user}/${pass}/${streamId}.${extension}`;
    return {
      id: `${section}-${streamId}`,
      name: item.name?.trim() || "Sem nome",
      logo: item.stream_icon || "",
      group,
      groupIndex,
      url,
      kind: section,
      plot: "",
      cast: "",
      director: "",
      genre: "",
      duration: "",
      rating: String(item.rating ?? ""),
      added: Number(item.added ?? 0),
    } satisfies MediaItem;
  });
}

async function loadFromM3u(session: Session) {
  const url = `${baseOf(session)}/get.php?${authQuery(session)}&type=m3u_plus&output=hls`;
  let response: Response;
  try {
    response = await fetchCatalog(url);
  } catch {
    throw new Error("Não foi possível consultar a lista direto no servidor.");
  }
  const text = await response.text();
  if (!response.ok || !text.includes("#EXTM3U")) {
    throw new Error("A DNS não retornou a lista. Confira se o endereço inclui a porta do servidor.");
  }
  return parseM3u(text);
}

export async function loadSection(session: Session, section: CatalogSection): Promise<MediaItem[]> {
  const cacheKey = `${session.dns}|${session.username}|${section}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    const items = await loadFromApi(session, section);
    cache.set(cacheKey, items);
    return items;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const canFallback = message === "NOT_JSON" || message.includes("404") || message.startsWith("Falha ao acessar");
    if (!canFallback) throw error;
  }

  const m3uKey = `${session.dns}|${session.username}`;
  if (!m3uCache || m3uCache.key !== m3uKey) {
    m3uCache = { key: m3uKey, data: await loadFromM3u(session) };
  }
  (["live", "vod", "series"] as const).forEach((name) => {
    cache.set(`${m3uKey}|${name}`, m3uCache!.data[name]);
  });
  return cache.get(cacheKey) ?? [];
}

export function clearCatalog() {
  cache.clear();
  m3uCache = null;
}

export async function loadVodDetails(session: Session, item: MediaItem): Promise<Partial<MediaItem>> {
  const streamId = item.id.replace(/^vod-/, "");
  try {
    const payload = (await readJson(`${baseOf(session)}/player_api.php?${authQuery(session)}&action=get_vod_info&vod_id=${streamId}`)) as {
      info?: Record<string, string>;
    };
    const info = payload.info ?? {};
    return {
      plot: info.plot || info.description || item.plot,
      cast: info.cast || info.actors || item.cast,
      director: info.director || item.director,
      genre: info.genre || item.genre,
      duration: info.duration || item.duration,
      rating: info.rating || item.rating,
      logo: info.movie_image || info.cover_big || item.logo,
    };
  } catch {
    return item;
  }
}

function textOf(value: unknown) {
  if (value == null) return "";
  return String(value).trim();
}

function readable(value: unknown) {
  const text = textOf(value);
  if (text.length < 24 || !/^[A-Za-z0-9+/=\s]+$/.test(text)) return text;
  try {
    const decoded = atob(text.replace(/\s/g, ""));
    if (/[A-Za-zÀ-ú]/.test(decoded) && !decoded.includes("\u0000")) return decoded.trim();
  } catch {
    return text;
  }
  return text;
}

function formatRuntime(seconds: unknown, fallback: unknown) {
  const value = Number(seconds);
  if (Number.isFinite(value) && value > 0) {
    const total = Math.round(value);
    return `${Math.floor(total / 60)}m ${total % 60}s`;
  }
  const text = textOf(fallback);
  const clock = /^(\d+):(\d+)(?::(\d+))?$/.exec(text);
  if (!clock) return text;
  if (clock[3] !== undefined) return `${Number(clock[1]) * 60 + Number(clock[2])}m ${Number(clock[3])}s`;
  return `${Number(clock[1])}m ${Number(clock[2])}s`;
}

function trailerOf(value: unknown) {
  const text = textOf(value);
  if (!text || text.toLowerCase() === "null") return "";
  if (/^https?:\/\//i.test(text)) return text;
  if (/^[\w-]{6,}$/.test(text)) return `https://www.youtube.com/watch?v=${text}`;
  return "";
}

export async function loadSeriesDetails(session: Session, item: MediaItem): Promise<SeriesDetails> {
  const fallback: SeriesDetails = {
    name: item.name,
    cover: item.logo,
    plot: item.plot,
    director: item.director,
    genre: item.genre,
    releaseDate: "",
    rating: item.rating,
    trailer: "",
    episodes: item.episodes ?? [],
  };
  if (!item.seriesId) return fallback;

  const payload = (await readJson(
    `${baseOf(session)}/player_api.php?${authQuery(session)}&action=get_series_info&series_id=${item.seriesId}`,
  )) as {
    info?: Record<string, unknown>;
    episodes?: Record<string, Array<Record<string, unknown>>>;
  };
  const info = payload.info ?? {};
  const episodes: SeriesEpisode[] = [];
  Object.entries(payload.episodes ?? {}).forEach(([season, list]) => {
    if (!Array.isArray(list)) return;
    list.forEach((episode) => {
      const meta = (episode.info ?? {}) as Record<string, unknown>;
      const extension = textOf(episode.container_extension) || "mp4";
      const direct = textOf(episode.direct_source);
      const id = textOf(episode.id);
      episodes.push({
        id: id || `${season}-${episodes.length}`,
        season: Number(episode.season || season),
        episode: Number(episode.episode_num || 0),
        title: textOf(episode.title) || `Episódio ${textOf(episode.episode_num) || episodes.length + 1}`,
        url: /^https?:\/\//i.test(direct)
          ? direct
          : `${baseOf(session)}/series/${encodeURIComponent(session.username)}/${encodeURIComponent(session.password)}/${encodeURIComponent(id)}.${extension}`,
        plot: readable(meta.plot || episode.plot),
        duration: formatRuntime(meta.duration_secs, meta.duration),
        rating: textOf(meta.rating) || textOf(episode.rating),
        image: textOf(meta.movie_image) || textOf(info.cover) || item.logo,
      });
    });
  });
  episodes.sort((a, b) => a.season - b.season || a.episode - b.episode);

  return {
    name: textOf(info.name) || item.name,
    cover: textOf(info.cover) || item.logo,
    plot: readable(info.plot) || item.plot,
    director: textOf(info.director) || item.director,
    genre: textOf(info.genre) || item.genre,
    releaseDate: textOf(info.releaseDate || info.release_date || info.releasedate),
    rating: textOf(info.rating_5based) || textOf(info.rating) || item.rating,
    trailer: trailerOf(info.youtube_trailer),
    episodes,
  };
}

const KIDS_FOLDER = /infantil|\bkids\b|anima[cç][aã]o|animation|desenho|crian[cç]a|cartoon/i;
const SPORTS = /jogo|futebol|sport|espn|premiere|dazn|combate|ufc|nba|nfl|campeonato|liga/i;
const ADULT = /adult|\+18|xxx|er[oó]t|sexo|porn/i;

export function isKidsItem(item: MediaItem) {
  return KIDS_FOLDER.test(item.group);
}

export function isSportsItem(item: MediaItem) {
  if (item.kind !== "live") return false;
  return SPORTS.test(`${item.group} ${item.name}`) || parseMatch(item.name) !== null;
}

export function isAdultItem(item: MediaItem) {
  return ADULT.test(`${item.group} ${item.name} ${item.genre}`);
}

export function newestFirst(items: MediaItem[]) {
  return [...items].sort((a, b) => b.added - a.added || a.groupIndex - b.groupIndex);
}

export function groupsInOrder(items: MediaItem[]) {
  const seen = new Set<string>();
  const groups: string[] = [];
  [...items].sort((a, b) => a.groupIndex - b.groupIndex).forEach((item) => {
    if (seen.has(item.group)) return;
    seen.add(item.group);
    groups.push(item.group);
  });
  return groups;
}

export function parseMatch(name: string) {
  const cleaned = name.replace(/\[[^\]]*\]/g, " ").replace(/\s+/g, " ").trim();
  const match = /^(.+?)\s+(?:x|vs\.?|×)\s+(.+)$/i.exec(cleaned);
  if (!match) return null;
  const away = match[2].replace(/\s+[-|].*$/, "").trim();
  const clock = /(\d{1,2}:\d{2})/.exec(cleaned)?.[1];
  return { home: match[1].trim(), away, clock };
}
