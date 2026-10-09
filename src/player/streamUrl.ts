import { toHttps } from "../lib/directUrl";

export type StreamKind = "ts" | "hls" | "file";

export type StreamAttempt = {
  src: string;
  kind: StreamKind;
};

const M3U8 = /\.m3u8(?=($|\?))/i;
const TS = /\.ts(?=($|\?))/i;

export { toHttps };

export function toTs(url: string) {
  return url.replace(M3U8, ".ts");
}

function kindOf(url: string): StreamKind {
  if (M3U8.test(url)) return "hls";
  if (TS.test(url)) return "ts";
  return "file";
}

export function liveAttempts(url: string, pageProtocol: string): StreamAttempt[] {
  const attempts: StreamAttempt[] = [];
  const push = (src: string) => {
    if (attempts.some((item) => item.src === src)) return;
    attempts.push({ src, kind: kindOf(src) });
  };

  const pageHttps = pageProtocol === "https:";
  const insecure = /^http:\/\//i.test(url);
  const direct = pageHttps && insecure ? toHttps(url) : url;
  push(direct);
  const directTs = toTs(direct);
  if (directTs !== direct) push(directTs);

  if (pageHttps && insecure) {
    try {
      const securePort = new URL(direct).port;
      if (securePort && securePort !== "443") {
        const onHttpsPort = new URL(direct);
        onHttpsPort.port = "";
        push(onHttpsPort.href);
        const httpsPortTs = toTs(onHttpsPort.href);
        if (httpsPortTs !== onHttpsPort.href) push(httpsPortTs);
      }
    } catch {
      // The https address already queued is the one the player uses.
    }
  }

  return attempts;
}
