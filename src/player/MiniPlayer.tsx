import { useEffect, useRef, useState } from "react";
import type { MediaItem } from "../lib/types";
import { startPlayback } from "./playback";

export function MiniPlayer({
  item,
  suspended,
  onExpand,
}: {
  item: MediaItem | null;
  suspended: boolean;
  onExpand: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !item || suspended) return;
    setStatus("Conectando…");
    return startPlayback(video, item.url, {
      live: true,
      onReady: () => setStatus(""),
      onFailure: (message) => setStatus(message),
    });
  }, [item, suspended]);

  return (
    <aside className="mini">
      <div
        className="mini__screen"
        role="button"
        tabIndex={0}
        onClick={() => item && onExpand()}
        onKeyDown={(event) => {
          if (item && (event.key === "Enter" || event.key === " ")) onExpand();
        }}
      >
        <video ref={videoRef} autoPlay playsInline />
        {!item ? <span>Selecione um canal</span> : null}
        {item && status ? <span>{status}</span> : null}
      </div>
      <p>{item?.name || "Mini player"}</p>
    </aside>
  );
}
