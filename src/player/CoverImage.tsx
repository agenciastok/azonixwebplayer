import { useState } from "react";

export function CoverImage({ url, className, alt = "" }: { url?: string; className?: string; alt?: string }) {
  const [failed, setFailed] = useState(false);
  const clean = url?.trim();
  const fallbackClass = className ? `${className} cover-fallback` : "cover-fallback";
  if (!clean || failed) return <span className={fallbackClass} aria-hidden="true" />;
  return <img className={className} src={clean} alt={alt} referrerPolicy="no-referrer" loading="lazy" decoding="async" fetchPriority="low" onError={() => setFailed(true)} />;
}
