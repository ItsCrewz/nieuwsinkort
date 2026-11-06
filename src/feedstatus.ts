import type { Soort, Video } from "./types";
import { videoSlug } from "./slug";

export type FeedStatus = { cat: "filmpjes" | "dumpert"; slug: string; soort: Soort; positie: number; speelt: boolean; lijst: Video[] };
const KEY = "nieuwsinkort-feedstatus";

// `laden`: actuele data is er nog niet; alleen dan mag de opgeslagen lijst tijdelijk dienen.
// Een definitief lege (of weggefilterde) lijst blijft leeg, zodat oude video's niet terugkomen.
export function herstelFeed(status: FeedStatus | null, cat: FeedStatus["cat"], slug: string, lijst: Video[], laden = false): { lijst: Video[]; slug: string } {
  const bron = lijst.length || !laden ? lijst : status?.cat === cat ? status.lijst : [];
  const gevonden = bron.find((v) => videoSlug(v) === slug);
  const oud = status?.cat === cat ? status.lijst.findIndex((v) => videoSlug(v) === slug) : -1;
  const gekozen = gevonden || bron[Math.min(Math.max(oud, 0), bron.length - 1)];
  return { lijst: bron, slug: gekozen ? videoSlug(gekozen) : slug };
}
// Vastgezette feedlijst bijwerken met de actuele lijst: volgorde blijft stabiel tijdens swipen, maar
// verdwenen items (ververst, bron uit) gaan eruit en de rest krijgt verse gegevens. Zelfde array als er niets wijzigt.
export function vastLijst(vast: Video[] | null, status: FeedStatus | null, cat: FeedStatus["cat"], slug: string, lijst: Video[]): Video[] | null {
  if (!lijst.length) return null;
  if (!vast) return herstelFeed(status, cat, slug, lijst).lijst;
  const actueel = new Map(lijst.map((v) => [videoSlug(v), v]));
  const bij = vast.flatMap((v) => actueel.get(videoSlug(v)) ?? []);
  if (!bij.length) return herstelFeed(status, cat, slug, lijst).lijst;
  return bij.length === vast.length && bij.every((v, i) => v === vast[i]) ? vast : bij;
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
