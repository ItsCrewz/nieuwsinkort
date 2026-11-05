// Extra tekst per bericht (/meer), apart zodat de lijst kan voorladen zonder het detailscherm (eigen chunk) te laden.
import type { Item, Meer } from "./types";
import { verzamelUrl } from "./puntenrelevantie";

function geldigMeer(v: unknown): v is Meer {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const m = v as Record<string, unknown>;
  const teksten = (x: unknown) => Array.isArray(x) && x.every((s) => typeof s === "string");
  const bronnen = (x: unknown, veld: string) => Array.isArray(x) && x.every((b) =>
    b && typeof b === "object" && !Array.isArray(b) && typeof b.site === "string" && typeof b.href === "string" && teksten(b[veld]));
  return (m.uitleg === undefined || teksten(m.uitleg))
    && (m.perBron === undefined || bronnen(m.perBron, "punten"))
    && (m.uittreksel === undefined || bronnen(m.uittreksel, "alineas"));
}

// Eén keer per sessie opgehaald; al vooraf bij aanraken van "Lees verder".
const meerCache = new Map<string, Promise<Meer | null>>();
export function prefetchMeer(item: Item): Promise<Meer | null> {
  const k = item.meer;
  if (!k || item.bronnen?.some((b) => verzamelUrl(b.href))) return Promise.resolve(null);
  let p = meerCache.get(k);
  if (!p) {
    p = fetch(`/meer?k=${encodeURIComponent(k)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((m: unknown) => geldigMeer(m) ? m : null)
      .catch(() => null);
    p.then((m) => { if (!m) meerCache.delete(k); });
    meerCache.set(k, p);
  }
  return p;
}
