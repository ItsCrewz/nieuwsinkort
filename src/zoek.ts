import { CAT_LABEL } from "./tabs";
import type { Item } from "./types";

export function normaliseer(tekst: string): string {
  return tekst.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export function zoekItems(items: Item[], query: string): Item[] {
  const woorden = normaliseer(query).split(" ").filter(Boolean);
  if (!woorden.length) return items;
  return items.filter((item) => {
    const tekst = normaliseer([item.kop, item.ai, item.samenvatting, ...(item.punten ?? []), ...(item.bronnen ?? []).map((bron) => bron.site), CAT_LABEL[item.cat]].filter(Boolean).join(" "));
    // Woordbegin: " " ervoor zodat "kat" niet in "politiek" valt, maar wel "katten" vindt.
    // Een numerieke term van ≥4 cijfers (jaartal) moet het hele getal zijn: 2024 vindt geen 20240. Korter blijft woordbegin ("20" vindt 2026, tijdens het typen).
    const haystack = " " + tekst + " ";
    return woorden.every((woord) => haystack.includes(" " + woord + (/^\p{N}{4,}$/u.test(woord) ? " " : "")));
  });
}
