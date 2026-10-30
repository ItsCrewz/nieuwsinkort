import type { Soort, Video } from "./types";
import { videoSlug } from "./slug";

export type FeedStatus = { cat: "filmpjes" | "dumpert"; slug: string; soort: Soort; positie: number; speelt: boolean; lijst: Video[] };
const KEY = "nieuwsinkort-feedstatus";

export function herstelFeed(status: FeedStatus | null, cat: FeedStatus["cat"], slug: string, lijst: Video[]): { lijst: Video[]; slug: string } {
  const bron = lijst.length ? lijst : status?.cat === cat ? status.lijst : [];
  const gevonden = bron.find((v) => videoSlug(v) === slug);
  const oud = status?.cat === cat ? status.lijst.findIndex((v) => videoSlug(v) === slug) ?? -1 : -1;
  const gekozen = gevonden || bron[Math.min(Math.max(oud, 0), bron.length - 1)];
  return { lijst: bron, slug: gekozen ? videoSlug(gekozen) : slug };
}
export function leesFeed(): FeedStatus | null {
  try {
    const s = JSON.parse(sessionStorage.getItem(KEY) || "null") || history.state?.feed;
    return s && (s.cat === "dumpert" || s.cat === "filmpjes") && typeof s.slug === "string" && Array.isArray(s.lijst) ? s : null;
  } catch { return null; }
}
export function bewaarFeed(s: FeedStatus) {
  try { sessionStorage.setItem(KEY, JSON.stringify(s)); } catch { /* opslag kan uitstaan */ }
  try { history.replaceState({ ...history.state, feed: s }, ""); } catch { /* geschiedenis kan niet beschikbaar zijn */ }
}
export function wisFeed() {
  try { sessionStorage.removeItem(KEY); } catch { /* opslag kan uitstaan */ }
}
