// Pure videohelpers (speler kiezen, soort Short/Journaal, proxy-URL); apart van video.tsx zodat het hoofdscherm en het voorladen niet de hele videogrid laden.
import type { Soort, Video } from "./types";
import { soortVan } from "./soort";
export { soortVan } from "./soort";

export type Player =
  | { kind: "youtube"; src: string }
  | { kind: "hls"; src: string }
  | { kind: "mp4"; src: string }
  | null;

export function youtubeId(url: string): string | null {
  const m =
    /youtube(?:-nocookie)?\.com\/(?:embed\/|shorts\/|live\/|watch\?(?:.*&)?v=)([\w-]{6,})/.exec(url) ||
    /youtu\.be\/([\w-]{6,})/.exec(url);
  return m ? m[1] : null;
}

export function playerFor(v: Video): Player {
  const e = v.embed || "";
  const yt = youtubeId(e) || youtubeId(v.href);
  if (yt) {
    return {
      kind: "youtube",
      src: `https://www.youtube-nocookie.com/embed/${yt}?autoplay=1&rel=0&playsinline=1&modestbranding=1&cc_load_policy=0`,
    };
  }
  try { if (new URL(e).protocol !== "https:") return null; } catch { return null; }
  if (/\.m3u8(\?|$)/i.test(e)) return { kind: "hls", src: e };
  if (/\.mp4(\?|$)/i.test(e)) return { kind: "mp4", src: e };
  return null;
}

// media.dumpert.nl staat geen andere sites toe (CORS). Native HLS (Safari/iOS) heeft daar geen last
// van; hls.js (Chrome/Firefox) haalt Dumpert via onze eigen proxy /media/dumpert/... (Pages Function).
export function viaProxy(src: string): string {
  try {
    const u = new URL(src);
    if (u.hostname === "media.dumpert.nl") return `/media/dumpert${u.pathname}${u.search}`;
  } catch {
    /* laat staan */
  }
  return src;
}

export const SOORTEN: { id: Soort; label: string; leeg: string }[] = [
  { id: "short", label: "Shorts", leeg: "Nog geen shorts vandaag." },
  { id: "journaal", label: "Journaals", leeg: "Nog geen journaals vandaag." },
];
/** Eerste soort met filmpjes (Shorts eerst, zoals een TikTok-feed). */
export function startSoort(list: Video[]): Soort {
  return list.some((v) => soortVan(v) === "short") || !list.length ? "short" : "journaal";
}
