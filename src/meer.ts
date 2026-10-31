// Extra tekst per bericht (/meer), apart zodat de lijst kan voorladen zonder het detailscherm (eigen chunk) te laden.
import type { Item, Meer } from "./types";

// Eén keer per sessie opgehaald; al vooraf bij aanraken van "Lees verder".
const meerCache = new Map<string, Promise<Meer | null>>();
export function prefetchMeer(item: Item): Promise<Meer | null> {
  const k = item.meer;
  if (!k) return Promise.resolve(null);
  let p = meerCache.get(k);
  if (!p) {
    p = fetch(`/meer?k=${encodeURIComponent(k)}`)
      .then((r) => (r.ok ? (r.json() as Promise<Meer>) : null))
      .catch(() => null);
    p.then((m) => { if (!m) meerCache.delete(k); });
    meerCache.set(k, p);
  }
  return p;
}
