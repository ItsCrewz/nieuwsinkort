import { dedupVideos } from "./dedup";
import { uniekeBeelden } from "./beeld";
import { veiligeUrl } from "./url";

/** Laatste stap, ook zonder uur-data: geen dubbele filmpjes (ook niet tussen Filmpjes en Dumpert), foto's opgeschoond, bronnen zonder http(s)-href weg. */
export function schoon<T = any>(D: T): T;
export function schoon(D: any) {
  if (!D || typeof D !== "object") return D;
  const d = dedupVideos(Array.isArray(D.dumpert) ? D.dumpert : []);
  const f = dedupVideos(Array.isArray(D.filmpjes) ? D.filmpjes : [], d.list);
  const items = Array.isArray(D.items) ? D.items.map((i: any) => {
    const b = uniekeBeelden([...(Array.isArray(i.beelden) ? i.beelden : []), i.beeld]);
    const { beeld, ...rest } = i;
    if (Array.isArray(rest.bronnen)) rest.bronnen = rest.bronnen.filter((x: any) => veiligeUrl(x?.href));
    return b.length ? { ...rest, beelden: b } : rest;
  }) : D.items;
  return { ...D, items, dumpert: d.list, filmpjes: f.list, ontdubbeld: { filmpjes: f.removed, dumpert: d.removed } };
}

