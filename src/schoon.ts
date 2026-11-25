import { dedupVideos } from "./dedup";
import { uniekeBeelden } from "./beeld";
import { veiligeUrl } from "./url";

// Een ongeldig item (null, string, getal) mag de opschoning van de rest niet breken: het valt weg.
const obj = (x: any) => !!x && typeof x === "object" && !Array.isArray(x);
const lijst = (x: any) => (Array.isArray(x) ? x.filter(obj) : []);

/** Laatste stap, ook zonder uur-data: geen dubbele filmpjes (ook niet tussen Filmpjes en Dumpert), foto's opgeschoond, bronnen zonder http(s)-href weg. */
export function schoon<T = any>(D: T): T;
export function schoon(D: any) {
  if (!D || typeof D !== "object") return D;
  const d = dedupVideos(lijst(D.dumpert));
  const films = lijst(D.filmpjes);
  const f = dedupVideos(films, films.some((v: any) => !v.gisteren) ? d.list.filter((v: any) => !v.gisteren) : d.list);
  const items = Array.isArray(D.items) ? D.items.filter(obj).map((i: any) => {
    const b = uniekeBeelden([...(Array.isArray(i.beelden) ? i.beelden : []), i.beeld]);
    const { beeld, beelden, ...rest } = i;
    if (Array.isArray(rest.bronnen)) rest.bronnen = rest.bronnen.filter((x: any) => veiligeUrl(x?.href));
    return b.length ? { ...rest, beelden: b } : rest;
  }) : D.items;
  return { ...D, items, dumpert: d.list, filmpjes: f.list, ontdubbeld: { filmpjes: f.removed, dumpert: d.removed } };
}

