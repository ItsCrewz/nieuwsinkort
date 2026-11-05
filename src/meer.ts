// Extra tekst per bericht (/meer), apart zodat de lijst kan voorladen zonder het detailscherm (eigen chunk) te laden.
import type { Item, Meer } from "./types";
import { verzamelUrl } from "./puntenrelevantie";

// Eén keer per sessie opgehaald; al vooraf bij aanraken van "Lees verder".
const meerCache = new Map<string, Promise<Meer | null>>();
export function prefetchMeer(item: Item): Promise<Meer | null> {
  const k = item.meer;
  if (!k || item.bronnen?.some((b) => verzamelUrl(b.href))) return Promise.resolve(null);
  let p = meerCache.get(k);
  if (!p) {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => { controller.abort(); resolve(null); }, 10000);
    });
    const aanvraag = fetch(`/meer?k=${encodeURIComponent(k)}`, { signal: controller.signal })
      .then((r) => (r.ok ? (r.json() as Promise<Meer>) : null))
      .catch(() => null);
    p = Promise.race([aanvraag, timeout]).then((m) => {
      clearTimeout(timer);
      if (!m && meerCache.get(k) === p) meerCache.delete(k);
      return m;
    });
    meerCache.set(k, p);
  }
  return p;
}
