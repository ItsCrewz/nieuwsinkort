// Vaste id per filmpje (voor #/filmpjes/<id>, en de KV-cache van video-samenvattingen). Zonder React, ook bruikbaar in Functions.
import type { Video } from "./types";
export function youtubeId(url: string): string | null {
  const m = /youtube(?:-nocookie)?\.com\/(?:embed\/|shorts\/|live\/|watch\?(?:.*&)?v=)([\w-]{6,})/.exec(url) || /youtu\.be\/([\w-]{6,})/.exec(url);
  return m ? m[1] : null;
}

export function videoSlug(v: Video): string {
  const yt = youtubeId(v.embed || "") || youtubeId(v.href);
  if (yt) return `yt-${yt}`;
  let m = /dumpert\.nl\/item\/([\w-]+)/.exec(v.href);
  if (m) return `d-${m[1]}`;
  m = /\/status\/(\d+)/.exec(v.href);
  if (m) return `x-${m[1]}`;
  m = /reddit\.com\/r\/[\w-]+\/comments\/(\w+)/.exec(v.href);
  if (m) return `r-${m[1]}`;
  m = /instagram\.com\/(?:reel|p)\/([\w-]+)/.exec(v.href);
  if (m) return `ig-${m[1]}`;
  return (
    v.titel
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "video"
  );
}

