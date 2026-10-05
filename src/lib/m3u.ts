import type { MediaItem, SeriesEpisode } from "./types";

type Draft = {
  name: string;
  logo: string;
  group: string;
  url: string;
};

function classify(url: string): MediaItem["kind"] {
  const path = url.toLowerCase();
  if (path.includes("/movie/")) return "vod";
  if (path.includes("/series/")) return "series";
  return "live";
}

function parseExtinf(line: string) {
  const group = /group-title="([^"]*)"/i.exec(line)?.[1]?.trim() || "Sem categoria";
  const logo = /tvg-logo="([^"]*)"/i.exec(line)?.[1]?.trim() || "";
  const comma = line.lastIndexOf(",");
  const name = (comma >= 0 ? line.slice(comma + 1) : "Sem nome").trim() || "Sem nome";
  return { name, logo, group };
}

function episodeMatch(name: string) {
  return /^(.*?)\s+S(\d{1,2})\s*E(\d{1,3})\b/i.exec(name);
}

export function parseM3u(text: string): { live: MediaItem[]; vod: MediaItem[]; series: MediaItem[] } {
  const lines = text.split(/\r?\n/);
  const drafts: Draft[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line.startsWith("#EXTINF")) continue;
    const info = parseExtinf(line);
    let url = "";
    for (let next = index + 1; next < lines.length; next += 1) {
      const candidate = lines[next].trim();
      if (!candidate) continue;
      if (candidate.startsWith("#")) break;
      url = candidate;
      break;
    }
    if (!url) continue;
    drafts.push({ ...info, url });
  }

  const live: MediaItem[] = [];
  const vod: MediaItem[] = [];
  const seriesGroups = new Map<string, MediaItem>();
  const groupOrder = new Map<string, number>();

  function orderFor(group: string) {
    const known = groupOrder.get(group);
    if (known !== undefined) return known;
    const next = groupOrder.size;
    groupOrder.set(group, next);
    return next;
  }

  drafts.forEach((draft, index) => {
    const kind = classify(draft.url);
    const groupIndex = orderFor(`${kind}:${draft.group}`);
    if (kind !== "series") {
      const item: MediaItem = {
        id: `${kind}-${index}`,
        name: draft.name,
        logo: draft.logo,
        group: draft.group,
        groupIndex,
        url: draft.url,
        kind,
        plot: "",
        cast: "",
        director: "",
        genre: "",
        duration: "",
        rating: "",
        added: drafts.length - index,
      };
      if (kind === "live") live.push(item);
      else vod.push(item);
      return;
    }

    const matched = episodeMatch(draft.name);
    const seriesName = (matched?.[1] || draft.name).trim();
    const key = `${draft.group}::${seriesName}`;
    const episode: SeriesEpisode = {
      id: `ep-${index}`,
      season: Number(matched?.[2] ?? 1),
      episode: Number(matched?.[3] ?? (seriesGroups.get(key)?.episodes?.length ?? 0) + 1),
      title: draft.name,
      url: draft.url,
      plot: "",
      duration: "",
      rating: "",
      image: draft.logo,
    };
    const existing = seriesGroups.get(key);
    if (existing) {
      existing.episodes = [...(existing.episodes ?? []), episode];
      return;
    }
    seriesGroups.set(key, {
      id: `series-${index}`,
      name: seriesName,
      logo: draft.logo,
      group: draft.group,
      groupIndex,
      url: draft.url,
      kind: "series",
      plot: "",
      cast: "",
      director: "",
      genre: "",
      duration: "",
      rating: "",
      added: drafts.length - index,
      episodes: [episode],
    });
  });

  return { live, vod, series: [...seriesGroups.values()] };
}
