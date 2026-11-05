import { CAT_LABEL } from "./tabs";
import type { Item } from "./types";

export function normaliseer(tekst: string): string {
  return tekst.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export function zoekItems(items: Item[], query: string): Item[] {
  const woorden = normaliseer(query).split(" ").filter(Boolean);
  if (!woorden.length) return query.trim() ? [] : items;
  return items.filter((item) => {
    const tekst = normaliseer([item.kop, item.ai, item.samenvatting, ...(item.punten ?? []), ...(item.bronnen ?? []).map((bron) => bron.site), CAT_LABEL[item.cat]].filter(Boolean).join(" "));
    return woorden.every((woord) => tekst.includes(woord));
  });
}
