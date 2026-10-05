import Hls from "hls.js";
import mpegts from "mpegts.js";
import { upstream } from "../lib/proxy";

type Kind = "hls" | "ts" | "file";

type Probe = { kind: Kind; src: string };

type Handlers = {
  live: boolean;
  onReady: () => void;
  onFailure: (message: string) => void;
};

function playableUrl(media: string) {
  if (media.startsWith("/api/upstream")) return media;
  try {
    const parsed = new URL(media, window.location.origin);
    if (parsed.origin === window.location.origin && parsed.pathname === "/api/upstream") {
      return `${parsed.pathname}${parsed.search}`;
    }
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return upstream(parsed.href);
  } catch {
    return media;
  }
  return media;
}

function firstMediaLine(playlist: string) {
  for (const line of playlist.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    return trimmed;
  }
  return "";
}

async function readHead(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < 4096) {
    const next = await reader.read();
    if (next.done) break;
    chunks.push(next.value);
    total += next.value.byteLength;
  }
  await reader.cancel().catch(() => undefined);
  const head = new Uint8Array(total);
  let offset = 0;
  chunks.forEach((chunk) => {
    head.set(chunk, offset);
    offset += chunk.byteLength;
  });
  return head;
}

async function probeStream(url: string): Promise<Probe> {
  const source = upstream(url);
  const response = await fetch(source);
  if (!response.ok) throw new Error(response.status === 404 ? "Conteúdo indisponível." : `O servidor recusou a reprodução (${response.status}).`);
  const head = await readHead(response);
  const text = new TextDecoder("utf-8", { fatal: false }).decode(head).replace(/^\uFEFF/, "").trimStart();
  if (text.startsWith("#EXTM3U")) {
    if (/#EXT-X-TARGETDURATION|#EXT-X-STREAM-INF|#EXT-X-MEDIA-SEQUENCE/i.test(text)) {
      return { kind: "hls", src: source };
    }
    const media = firstMediaLine(text);
    if (!media || /\.m3u8(\?|$)/i.test(media)) return { kind: "hls", src: source };
    if (/\.(mp4|m4v|webm)(\?|$)/i.test(media)) return { kind: "file", src: playableUrl(media) };
    return { kind: "ts", src: playableUrl(media) };
  }
  if (head[0] === 0x47) return { kind: "ts", src: source };
  const type = response.headers.get("content-type") || "";
  if (/\.(mp4|m4v|webm)(\?|$)/i.test(url) || type.includes("mp4") || type.includes("webm")) {
    return { kind: "file", src: source };
  }
  if (/\.m3u8(\?|$)/i.test(url)) return { kind: "hls", src: source };
  return { kind: "file", src: source };
}

function attachFile(video: HTMLVideoElement, src: string, onFatal: () => void) {
  let active = true;
  const onError = () => {
    if (active) onFatal();
  };
  video.addEventListener("error", onError);
  video.src = src;
  void video.play().catch(() => undefined);
  return () => {
    active = false;
    video.removeEventListener("error", onError);
  };
}

function attachHls(video: HTMLVideoElement, src: string, onFatal: () => void) {
  if (!Hls.isSupported()) {
    if (video.canPlayType("application/vnd.apple.mpegurl")) return attachFile(video, src, onFatal);
    onFatal();
    return () => undefined;
  }
  const hls = new Hls({
    enableWorker: false,
    lowLatencyMode: false,
    manifestLoadingMaxRetry: 1,
    levelLoadingMaxRetry: 1,
    fragLoadingMaxRetry: 2,
    maxBufferLength: 20,
    backBufferLength: 30,
    maxLiveSyncPlaybackRate: 1,
  });
  let active = true;
  let recovered = false;
  const die = () => {
    if (!active) return;
    active = false;
    queueMicrotask(onFatal);
  };
  hls.on(Hls.Events.ERROR, (_event, data) => {
    if (!data.fatal) return;
    if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !recovered) {
      recovered = true;
      hls.recoverMediaError();
      return;
    }
    die();
  });
  hls.loadSource(src);
  hls.attachMedia(video);
  hls.on(Hls.Events.MANIFEST_PARSED, () => {
    void video.play().catch(() => undefined);
  });
  return () => {
    active = false;
    hls.destroy();
  };
}

function attachTs(video: HTMLVideoElement, src: string, live: boolean, onFatal: () => void) {
  if (!mpegts.isSupported()) {
    onFatal();
    return () => undefined;
  }
  let active = true;
  const player = mpegts.createPlayer(
    { type: "mpegts", isLive: live, url: src },
    {
      enableWorker: false,
      enableStashBuffer: true,
      stashInitialSize: 128,
      lazyLoad: false,
      isLive: live,
      liveBufferLatencyChasing: false,
      liveSync: false,
      autoCleanupSourceBuffer: true,
      autoCleanupMaxBackwardDuration: 60,
      autoCleanupMinBackwardDuration: 20,
    },
  );
  player.on(mpegts.Events.ERROR, () => {
    if (!active) return;
    active = false;
    queueMicrotask(onFatal);
  });
  player.attachMediaElement(video);
  player.load();
  void player.play();
  return () => {
    active = false;
    player.pause();
    player.unload();
    player.detachMediaElement();
    player.destroy();
  };
}

export function startPlayback(video: HTMLVideoElement, url: string, handlers: Handlers) {
  let stopped = false;
  let release = () => undefined as void;
  let triedTs = false;
  const ready = () => {
    if (video.playbackRate !== 1) video.playbackRate = 1;
    if (!stopped) handlers.onReady();
  };
  const keepNormalSpeed = () => {
    if (video.playbackRate !== 1) video.playbackRate = 1;
  };
  video.addEventListener("playing", ready);
  video.addEventListener("canplay", ready);
  video.addEventListener("ratechange", keepNormalSpeed);

  const fail = (message: string) => {
    if (!stopped) handlers.onFailure(message);
  };

  const clearEngine = () => {
    release();
    release = () => undefined;
    video.pause();
    video.removeAttribute("src");
    video.load();
  };

  const openTs = (src: string, onFatal: () => void) => {
    release = attachTs(video, src, handlers.live, onFatal);
  };

  if (handlers.live) {
    const tsUrl = url.replace(/\.m3u8(?=($|\?))/i, ".ts");
    const giveUp = () => fail("Não foi possível reproduzir.");
    if (tsUrl === url) openTs(upstream(url), giveUp);
    else {
      openTs(upstream(tsUrl), () => {
        if (stopped) return;
        clearEngine();
        if (stopped) return;
        release = attachHls(video, upstream(url), giveUp);
      });
    }
  } else {
    const fallback = () => {
      if (stopped) return;
      const tsUrl = url.replace(/\.m3u8(?=($|\?))/i, ".ts");
      if (triedTs || tsUrl === url) {
        fail("Não foi possível reproduzir.");
        return;
      }
      triedTs = true;
      clearEngine();
      if (stopped) return;
      openTs(upstream(tsUrl), () => fail("Não foi possível reproduzir."));
    };

    void (async () => {
      try {
        const probe = await probeStream(url);
        if (stopped) return;
        if (probe.kind === "hls") release = attachHls(video, probe.src, fallback);
        else if (probe.kind === "ts") openTs(probe.src, () => fail("Não foi possível reproduzir."));
        else release = attachFile(video, probe.src, () => fail("Não foi possível reproduzir este vídeo."));
      } catch (error) {
        fail(error instanceof Error ? error.message : "Não foi possível reproduzir.");
      }
    })();
  }

  return () => {
    stopped = true;
    video.removeEventListener("playing", ready);
    video.removeEventListener("canplay", ready);
    video.removeEventListener("ratechange", keepNormalSpeed);
    release();
    video.pause();
    video.removeAttribute("src");
    video.load();
  };
}
