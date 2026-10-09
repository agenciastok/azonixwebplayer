export const VPS_ORIGIN = "https://azonixwebplayer-webplayer.uegiml.easypanel.host";

export function vpsProxy(kind: "playlist" | "stream", url: string) {
  return `${VPS_ORIGIN}/api/proxy/${kind}?url=${encodeURIComponent(url)}`;
}
