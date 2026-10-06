import { useEffect, useRef, useState } from "react";
import { startPlayback } from "./playback";
import { CoverImage } from "./CoverImage";

function clock(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  const remain = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remain).padStart(2, "0")}`;
}

function storedVolume() {
  const saved = Number(localStorage.getItem("azonix.volume"));
  if (!Number.isFinite(saved)) return 1;
  return Math.min(1, Math.max(0, saved));
}

function VolumeIcon({ level }: { level: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 10h3.2L12 6.5v11L7.2 14H4z" />
      {level === 0 ? <path d="m16 10 4 4m0-4-4 4" /> : <path d="M16 9.5a4 4 0 0 1 0 5" />}
      {level > 0.5 ? <path d="M18.5 7.5a7 7 0 0 1 0 9" /> : null}
    </svg>
  );
}

export function PlayerOverlay({
  title,
  url,
  poster,
  live = false,
  plot = "",
  onClose,
}: {
  title: string;
  url: string;
  poster?: string;
  live?: boolean;
  plot?: string;
  onClose: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [full, setFull] = useState(false);
  const [status, setStatus] = useState("Conectando…");
  const [failed, setFailed] = useState("");
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [paused, setPaused] = useState(false);
  const [info, setInfo] = useState(false);
  const [chrome, setChrome] = useState(true);
  const [moveTick, setMoveTick] = useState(0);
  const [volume, setVolume] = useState(storedVolume);
  const lastMove = useRef(0);
  const volumeRef = useRef(volume);
  const audibleRef = useRef(volume > 0 ? volume : 1);
  volumeRef.current = volume;

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !url) return;
    setStatus("Conectando…");
    setFailed("");
    setCurrent(0);
    setDuration(0);
    video.volume = volumeRef.current;
    const stop = startPlayback(video, url, {
      live,
      onReady: () => setStatus(""),
      onFailure: (message) => {
        setStatus("");
        setFailed(message);
      },
    });
    const sync = () => {
      setCurrent(video.currentTime || 0);
      setDuration(Number.isFinite(video.duration) ? video.duration : 0);
      setPaused(video.paused);
    };
    video.addEventListener("timeupdate", sync);
    video.addEventListener("durationchange", sync);
    video.addEventListener("play", sync);
    video.addEventListener("pause", sync);
    return () => {
      video.removeEventListener("timeupdate", sync);
      video.removeEventListener("durationchange", sync);
      video.removeEventListener("play", sync);
      video.removeEventListener("pause", sync);
      stop();
    };
  }, [url, live]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const video = videoRef.current;
      if (!video) return;
      if (event.key === " ") {
        event.preventDefault();
        if (video.paused) void video.play().catch(() => undefined);
        else video.pause();
      } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        if (!Number.isFinite(video.duration)) return;
        const delta = event.key === "ArrowLeft" ? -10 : 10;
        video.currentTime = Math.min(video.duration, Math.max(0, video.currentTime + delta));
      } else if (event.key.toLowerCase() === "i") {
        setInfo((value) => !value);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!chrome || paused || status || failed) return;
    const timer = window.setTimeout(() => setChrome(false), 4000);
    return () => window.clearTimeout(timer);
  }, [chrome, paused, status, failed, moveTick]);

  function toggle() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play().catch(() => undefined);
    else video.pause();
  }

  function seek(delta: number) {
    const video = videoRef.current;
    if (!video || !Number.isFinite(video.duration)) return;
    video.currentTime = Math.min(video.duration, Math.max(0, video.currentTime + delta));
  }

  function changeVolume(next: number) {
    const value = Math.min(1, Math.max(0, next));
    if (value > 0) audibleRef.current = value;
    setVolume(value);
    const video = videoRef.current;
    if (video) video.volume = value;
    localStorage.setItem("azonix.volume", String(value));
  }

  function toggleMute() {
    changeVolume(volume === 0 ? audibleRef.current || 1 : 0);
  }

  useEffect(() => {
    const sync = () => setFull(document.fullscreenElement === rootRef.current);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  function toggleFull() {
    const node = rootRef.current;
    if (!node) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void node.requestFullscreen();
    setChrome(true);
  }

  function showChrome() {
    const now = Date.now();
    setChrome(true);
    if (now - lastMove.current < 500) return;
    lastMove.current = now;
    setMoveTick((value) => value + 1);
  }

  return (
    <div className="stage" ref={rootRef} onMouseMove={showChrome}>
      <video ref={videoRef} autoPlay playsInline onClick={toggle} onDoubleClick={toggleFull} />
      {status ? <p className="stage__status">{status}</p> : null}
      {failed ? <p className="stage__status stage__status--error">{failed}</p> : null}
      {info ? (
        <div className="stage__info">
          <strong>{title}</strong>
          <p>{plot.trim() || "Sem informações adicionais."}</p>
        </div>
      ) : null}
      {chrome ? (
        <div className="stage__bar">
          <CoverImage className="stage__thumb" url={poster} alt="" />
          <div className="stage__main">
            <div className="timeline">
              <span>{clock(current)}</span>
              <input
                type="range"
                min={0}
                max={duration || 0}
                step={0.1}
                value={Math.min(current, duration || 0)}
                disabled={!duration}
                aria-label="Posição"
                onChange={(event) => {
                  const video = videoRef.current;
                  if (!video) return;
                  video.currentTime = Number(event.target.value);
                }}
              />
              <span>{live || !duration ? "AO VIVO" : clock(duration)}</span>
            </div>
            <div className="stage__row">
              <strong>{title}</strong>
              <div className="volume">
                <button type="button" className="volume__btn" onClick={toggleMute} aria-label={volume === 0 ? "Ativar som" : "Silenciar"}>
                  <VolumeIcon level={volume} />
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={volume}
                  aria-label="Volume"
                  style={{ background: `linear-gradient(90deg, #3aee78 ${volume * 100}%, rgba(255,255,255,0.35) ${volume * 100}%)` }}
                  onChange={(event) => changeVolume(Number(event.target.value))}
                />
              </div>
              <div className="keys">
                <button onClick={onClose}><small>EXIT</small>Sair</button>
                <button onClick={toggle}><small>OK</small>Play/Pausar</button>
                <button onClick={() => seek(-10)}><small>◀</small>Voltar</button>
                <button onClick={() => seek(10)}><small>▶</small>Acelerar</button>
                <button onClick={() => setInfo((value) => !value)}><small>▲</small>Info</button>
                <button onClick={toggleFull}><small>⛶</small>{full ? "Janela" : "Tela cheia"}</button>
              </div>
            </div>
          </div>
          <button className="stage__chevron" onClick={() => setChrome(false)} aria-label="Ocultar controles">⌄</button>
        </div>
      ) : (
        <button className="stage__chevron stage__chevron--solo" onClick={() => setChrome(true)} aria-label="Mostrar controles">⌃</button>
      )}
    </div>
  );
}
