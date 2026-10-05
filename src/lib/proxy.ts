export function upstream(url: string) {
  return `/api/upstream?url=${encodeURIComponent(url)}`;
}

export function proxiedImage(url: string) {
  if (!url) return "";
  if (url.startsWith("data:") || url.startsWith("/")) return url;
  return upstream(url);
}
