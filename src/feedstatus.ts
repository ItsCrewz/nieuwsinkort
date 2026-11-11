import type { Soort, Video } from "./types";
import { videoSlug } from "./slug";

export type FeedStatus = { cat: "filmpjes" | "dumpert"; slug: string; soort: Soort; positie: number; speelt: boolean; lijst: Video[] };
const KEY = "nieuwsinkort-feedstatus";

// De app toont tot de data er is een skeleton (VideoGrid is dan niet gemount), dus `lijst` is altijd actueel:
// een lege of weggefilterde lijst blijft leeg, zodat oude of uitgesloten video's niet terugkomen.
export function herstelFeed(status: FeedStatus | null, cat: FeedStatus["cat"], slug: string, lijst: Video[]): { lijst: Video[]; slug: string } {
  const bron = lijst;
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
// Open feed bijwerken met de actuele, toegestane items: verdwenen of uitgesloten video's gaan eruit, de rest
// krijgt verse gegevens en `actief` blijft op dezelfde video (of de dichtstbijzijnde als die zelf verdween).
export function syncFeed(items: Video[], actief: number, actueel: Video[]): { items: Video[]; actief: number } {
  const vers = new Map(actueel.map((v) => [videoSlug(v), v]));
  const nu = items.flatMap((v) => vers.get(videoSlug(v)) ?? []);
  if (nu.length === items.length && nu.every((v, i) => v === items[i])) return { items, actief };
  const slug = items[actief] ? videoSlug(items[actief]) : "";
  const k = nu.findIndex((v) => videoSlug(v) === slug);
  const voor = items.slice(0, actief).filter((v) => vers.has(videoSlug(v))).length;
  return { items: nu, actief: k >= 0 ? k : Math.max(0, Math.min(voor, nu.length - 1)) };
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
