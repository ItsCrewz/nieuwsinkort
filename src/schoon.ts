import { dedupVideos } from "./dedup";
import { uniekeBeelden } from "./beeld";

/** Laatste stap, ook zonder uur-data: geen dubbele filmpjes (ook niet tussen Filmpjes en Dumpert), foto's opgeschoond. */
export function schoon<T = any>(D: T): T;
export function schoon(D: any) {
  if (!D || typeof D !== "object") return D;
  const d = dedupVideos(Array.isArray(D.dumpert) ? D.dumpert : []);
  const f = dedupVideos(Array.isArray(D.filmpjes) ? D.filmpjes : [], d.list);
  const items = Array.isArray(D.items) ? D.items.map((i: any) => {
    const b = uniekeBeelden([...(Array.isArray(i.beelden) ? i.beelden : []), i.beeld]);
    const { beeld, ...rest } = i;
    return b.length ? { ...rest, beelden: b } : rest;
  }) : D.items;
  return { ...D, items, dumpert: d.list, filmpjes: f.list, ontdubbeld: { filmpjes: f.removed, dumpert: d.removed } };
}

