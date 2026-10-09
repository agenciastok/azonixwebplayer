import { vpsProxy } from "../lib/vps";

export type StreamKind = "ts" | "hls" | "file";

export type StreamAttempt = {
  src: string;
  kind: StreamKind;
};

const M3U8 = /\.m3u8(?=($|\?))/i;
const TS = /\.ts(?=($|\?))/i;

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

export function toTs(url: string) {
  return url.replace(M3U8, ".ts");
}

function toM3u8(url: string) {
  if (M3U8.test(url)) return url;
  return url.replace(TS, ".m3u8");
}

function kindOf(url: string): StreamKind {
  if (M3U8.test(url)) return "hls";
  if (TS.test(url)) return "ts";
  return "file";
}

function streamProxy(url: string) {
  return vpsProxy("stream", url);
}

function targetOf(src: string) {
  const encoded = /\/api\/proxy\/stream\?url=([^&]*)/.exec(src)?.[1];
  if (!encoded) return src;
  try {
    return decodeURIComponent(encoded);
  } catch {
    return src;
  }
}

export function liveAttempts(url: string, pageProtocol: string): StreamAttempt[] {
  const attempts: StreamAttempt[] = [];
  const push = (src: string) => {
    if (attempts.some((item) => item.src === src)) return;
    attempts.push({ src, kind: kindOf(targetOf(src)) });
  };

  const pageHttps = pageProtocol === "https:";
  const insecure = /^http:\/\//i.test(url);
  const direct = pageHttps && insecure ? toHttps(url) : url;
  push(direct);
  const directTs = toTs(direct);
  if (directTs !== direct) push(directTs);

  if (pageHttps && insecure) {
    const securePort = new URL(direct).port;
    if (securePort && securePort !== "443") {
      const onHttpsPort = new URL(direct);
      onHttpsPort.port = "";
      push(onHttpsPort.href);
      const httpsPortTs = toTs(onHttpsPort.href);
      if (httpsPortTs !== onHttpsPort.href) push(httpsPortTs);
    }
    push(streamProxy(toTs(url)));
    const manifest = toM3u8(url);
    if (M3U8.test(manifest)) push(streamProxy(manifest));
  }

  return attempts;
}
