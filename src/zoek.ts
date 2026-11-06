import { CAT_LABEL } from "./tabs";
import type { Item } from "./types";

export function normaliseer(tekst: string): string {
  return tekst.normalize("NFD").replace(/(\p{Script=Latin})\p{M}+/gu, "$1").toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, " ").trim();
}

export function zoekItems(items: Item[], query: string): Item[] {
  const woorden = normaliseer(query).split(" ").filter(Boolean);
  if (!woorden.length) return items;
  return items.filter((item) => {
    const tekst = normaliseer([item.kop, item.ai, item.samenvatting, ...(item.punten ?? []), ...(item.bronnen ?? []).map((bron) => bron.site), CAT_LABEL[item.cat]].filter(Boolean).join(" "));
    // Woordbegin: " " ervoor zodat "kat" niet in "politiek" valt, maar wel "katten" vindt.
    const haystack = " " + tekst;
    return woorden.every((woord) => haystack.includes(" " + woord));
  });
}
