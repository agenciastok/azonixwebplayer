import Hls from "hls.js";
import mpegts from "mpegts.js";

const DIRECT_FAILURE = "Não foi possível reproduzir direto do servidor de conteúdo.";

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

type Handlers = {
  live: boolean;
  onReady: () => void;
  onFailure: (message: string) => void;
};

export function startPlayback(video: HTMLVideoElement, url: string, handlers: Handlers) {
  let stopped = false;
  let release = () => undefined as void;
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

  const giveUp = () => fail(DIRECT_FAILURE);

  if (handlers.live) {
    const tsUrl = url.replace(/\.m3u8(?=($|\?))/i, ".ts");
    if (tsUrl === url) openTs(url, giveUp);
    else {
      openTs(tsUrl, () => {
        if (stopped) return;
        clearEngine();
        if (stopped) return;
        release = attachHls(video, url, giveUp);
      });
    }
  } else if (/\.m3u8(\?|$)/i.test(url)) {
    release = attachHls(video, url, giveUp);
  } else if (/\.ts(\?|$)/i.test(url)) {
    openTs(url, giveUp);
  } else {
    release = attachFile(video, url, giveUp);
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
