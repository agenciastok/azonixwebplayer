import { playableUrl } from "../lib/directUrl";
import type { StreamAttempt, StreamKind } from "./streamUrl";

function kindOf(src: string): StreamKind | null {
  const path = src.split("?")[0] ?? src;
  if (/\.m3u8$/i.test(path)) return "hls";
  if (/\.ts$/i.test(path)) return "ts";
  if (/\.(mp4|m4v|mkv|webm)$/i.test(path)) return "file";
  return null;
}

async function ask(url: string) {
  const response = await fetch(`/api/proxy/redirect?url=${encodeURIComponent(url)}`);
  if (!response.ok) return null;
  const data = (await response.json()) as { url?: string };
  if (!data.url || data.url === url) return null;
  return data.url;
}

async function located(url: string) {
  const direct = await ask(url);
  if (direct) return playableUrl(direct);
  if (!/^https:\/\//i.test(url)) return null;
  const insecure = `http://${url.slice("https://".length)}`;
  const fromHttp = await ask(insecure);
  if (!fromHttp || fromHttp === insecure) return null;
  return playableUrl(fromHttp);
}

export async function resolveLive(attempt: StreamAttempt): Promise<StreamAttempt> {
  try {
    const next = await located(attempt.src);
    if (!next || next === attempt.src) return attempt;
    return { src: next, kind: kindOf(next) ?? attempt.kind };
  } catch {
    return attempt;
  }
}
