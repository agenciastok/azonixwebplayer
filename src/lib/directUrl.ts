export function toHttps(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:") return url;
    parsed.protocol = "https:";
    if (parsed.port === "80") parsed.port = "";
    return parsed.href;
  } catch {
    return url.replace(/^http:\/\//i, "https://");
  }
}

export function directCandidates(url: string) {
  if (typeof window === "undefined" || window.location.protocol !== "https:" || !/^http:\/\//i.test(url)) return [url];
  const upgraded = toHttps(url);
  const list = [upgraded];
  try {
    const parsed = new URL(upgraded);
    if (parsed.port && parsed.port !== "443") {
      parsed.port = "";
      list.push(parsed.href);
    }
  } catch {
    // The first https address is still tried.
  }
  return list;
}

export function playableUrl(url: string) {
  return directCandidates(url)[0] ?? url;
}
