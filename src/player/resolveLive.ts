import { playableUrl } from "../lib/directUrl";
import type { StreamAttempt, StreamKind } from "./streamUrl";

function kindOf(src: string): StreamKind | null {
  const path = src.split("?")[0] ?? src;
  if (/\.m3u8$/i.test(path)) return "hls";
  if (/\.ts$/i.test(path)) return "ts";
  if (/\.(mp4|m4v|mkv|webm)$/i.test(path)) return "file";
  return null;
}

async function located(url: string) {
  const response = await fetch(`/api/proxy/redirect?url=${encodeURIComponent(url)}`);
  if (!response.ok) return null;
  const data = (await response.json()) as { url?: string };
  if (!data.url) return null;
  const next = playableUrl(data.url);
  if (!next || next === url) return null;
  return next;
}

export async function resolveLive(attempt: StreamAttempt): Promise<StreamAttempt> {
  try {
    const next = await located(attempt.src);
    if (!next) return attempt;
    return { src: next, kind: kindOf(next) ?? attempt.kind };
  } catch {
    return attempt;
  }
}
