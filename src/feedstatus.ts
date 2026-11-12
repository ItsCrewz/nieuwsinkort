import type { Soort, Video } from "./types";
import { oudeSlug, videoSlug, vindSlug } from "./slug";

export type FeedStatus = { cat: "filmpjes" | "dumpert"; slug: string; soort: Soort; positie: number; speelt: boolean; lijst: Video[] };
const KEY = "nieuwsinkort-feedstatus";

export function herstelFeed(status: FeedStatus | null, cat: FeedStatus["cat"], slug: string, lijst: Video[]): { lijst: Video[]; slug: string | null } {
  const bron = lijst.length ? lijst : status?.cat === cat ? status.lijst : [];
  const gevonden = vindSlug(bron, slug);
  const oud = status?.cat === cat ? status.lijst.findIndex((v) => videoSlug(v) === slug) : -1;
  const dubbel = bron.filter((v) => oudeSlug(v) === slug).length > 1;
  // Een dubbelzinnige oude titelroute opent geen willekeurige video (zonder bekende positie).
  const gekozen = gevonden || (dubbel && oud < 0 ? undefined : bron[Math.min(Math.max(oud, 0), bron.length - 1)]);
  // null = dubbelzinnige oude route: de aanroeper opent geen video.
  if (dubbel && !gevonden && oud < 0) return { lijst: bron, slug: null };
  return { lijst: bron, slug: gekozen ? videoSlug(gekozen) : slug };
}
// Beginpositie van de feed: een onbekende slug opent nooit "toevallig" de eerste video.
export function startIndex(items: Video[], start: string | null): number {
  return Math.max(0, items.findIndex((v) => videoSlug(v) === start));
}
export function leesFeed(): FeedStatus | null {
  const geldig = (s: FeedStatus | null): s is FeedStatus => !!s && (s.cat === "dumpert" || s.cat === "filmpjes") && typeof s.slug === "string" && Array.isArray(s.lijst);
  try {
    const s = JSON.parse(sessionStorage.getItem(KEY) || "null");
    if (geldig(s)) return s;
  } catch { /* opslag kan uitstaan of ongeldige JSON bevatten */ }
  try { const s = history.state?.feed; return geldig(s) ? s : null; } catch { return null; }
}
export function bewaarFeed(s: FeedStatus) {
  try { sessionStorage.setItem(KEY, JSON.stringify(s)); } catch { /* opslag kan uitstaan */ }
  try { history.replaceState({ ...history.state, feed: s }, ""); } catch { /* geschiedenis kan niet beschikbaar zijn */ }
}
export function wisFeed() {
  try { sessionStorage.removeItem(KEY); } catch { /* opslag kan uitstaan */ }
  // Ook uit de geschiedenis, anders leest leesFeed de oude status daar weer terug; andere velden blijven.
  try {
    const st = history.state;
    if (st && typeof st === "object" && "feed" in st) { const { feed: _weg, ...rest } = st; history.replaceState(rest, ""); }
  } catch { /* geschiedenis kan niet beschikbaar zijn */ }
}
