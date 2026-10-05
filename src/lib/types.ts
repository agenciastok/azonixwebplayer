export type MediaKind = "live" | "vod" | "series";

export type SeriesEpisode = {
  id: string;
  season: number;
  episode: number;
  title: string;
  url: string;
  plot: string;
  duration: string;
  rating: string;
  image: string;
};

export type SeriesDetails = {
  name: string;
  cover: string;
  plot: string;
  director: string;
  genre: string;
  releaseDate: string;
  rating: string;
  trailer: string;
  episodes: SeriesEpisode[];
};

export type MediaItem = {
  id: string;
  name: string;
  logo: string;
  group: string;
  groupIndex: number;
  url: string;
  kind: MediaKind;
  plot: string;
  cast: string;
  director: string;
  genre: string;
  duration: string;
  rating: string;
  added: number;
  seriesId?: string;
  episodes?: SeriesEpisode[];
};

export type AccountInfo = {
  username: string;
  status: string;
  expDate: string;
  plan: string;
};

export type Session = {
  code: string;
  dns: string;
  username: string;
  password: string;
  account: AccountInfo;
};

export type CatalogSection = "live" | "vod" | "series";
