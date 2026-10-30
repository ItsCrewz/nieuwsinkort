// Pure videohelpers (speler kiezen, soort Short/Journaal, proxy-URL); apart van video.tsx zodat het hoofdscherm en het voorladen niet de hele videogrid laden.
import type { Soort, Video } from "./types";

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
      src: `https://www.youtube-nocookie.com/embed/${yt}?autoplay=1&rel=0&playsinline=1&modestbranding=1`,
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

// Shorts vs. Journaals: zelfde regels als worker/src/videos.ts (soortVan) en filmpjes.py (soort_van).
const JOURNAAL_RE = /journaal|nieuwsuitzending|\buitzending\b|bulletin|nieuwsoverzicht|het nieuws van|nieuws van (de dag|vandaag)|\b(nos|rtl) nieuws (om )?\d{1,2}[:.]\d{2}|\b(8|20|18|19)[:.]00 ?uur/i;
export function soortVan(v: Video): Soort {
  if (v.soort === "short" || v.soort === "journaal") return v.soort;
  if (JOURNAAL_RE.test(v.titel || "")) return "journaal";
  const u = `${v.href || ""} ${v.embed || ""}`;
  if (/youtube\.com\/shorts\//i.test(u)) return "short";
  if (/youtube(?:-nocookie)?\.com\/(?:watch|embed|live)|youtu\.be\//i.test(u) && !/dumpert/i.test(v.bron || "")) return "journaal";
  return "short";
}
export const SOORTEN: { id: Soort; label: string; leeg: string }[] = [
  { id: "short", label: "Shorts", leeg: "Nog geen shorts vandaag." },
  { id: "journaal", label: "Journaals", leeg: "Nog geen journaals vandaag." },
];
/** Eerste soort met filmpjes (Shorts eerst, zoals een TikTok-feed). */
export function startSoort(list: Video[]): Soort {
  return list.some((v) => soortVan(v) === "short") || !list.length ? "short" : "journaal";
}
