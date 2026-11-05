import { CAT_LABEL } from "./tabs";
import type { Item } from "./types";

export function normaliseer(tekst: string): string {
  return tekst.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export function zoekItems(items: Item[], query: string): Item[] {
  const groepen: string[] = [];
  const los = query.replace(/"([^"]*)"/g, (_, groep: string) => {
    const tekst = normaliseer(groep);
    if (tekst) groepen.push(tekst);
    return " ";
  });
  const woorden = normaliseer(los).split(" ").filter(Boolean);
  if (!woorden.length && !groepen.length) return items;
  return items.filter((item) => {
    const velden = [item.kop, item.ai, item.samenvatting, ...(item.punten ?? []), ...(item.bronnen ?? []).map((bron) => bron.site), CAT_LABEL[item.cat]].filter(Boolean).map((veld) => normaliseer(veld!));
    const tekst = velden.join(" ");
    return woorden.every((woord) => tekst.includes(woord)) && groepen.every((groep) => velden.some((veld) => veld.includes(groep)));
  });
}
