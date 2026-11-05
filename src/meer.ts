// Extra tekst per bericht (/meer), apart zodat de lijst kan voorladen zonder het detailscherm (eigen chunk) te laden.
import type { Item, Meer } from "./types";
import { verzamelUrl } from "./puntenrelevantie";

// Verdieping alleen tonen als de sleutel van de state bij het huidige item hoort (#646); anders laden, zonder sleutel niets.
export type MeerState = { k?: string; meer: Meer | null; laden: boolean };
export function meerVoor(st: MeerState, k: string | undefined): { meer: Meer | null; laden: boolean } {
  if (!k) return { meer: null, laden: false };
  return st.k === k ? { meer: st.meer, laden: st.laden } : { meer: null, laden: true };
}

// Eén keer per sessie opgehaald; al vooraf bij aanraken van "Lees verder".
const meerCache = new Map<string, Promise<Meer | null>>();
export function prefetchMeer(item: Item): Promise<Meer | null> {
  const k = item.meer;
  if (!k || item.bronnen?.some((b) => verzamelUrl(b.href))) return Promise.resolve(null);
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
