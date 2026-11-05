import { CAT_LABEL } from "./tabs";
import type { Item } from "./types";

export function normaliseer(tekst: string): string {
  return tekst.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

type Zoektekst = { velden: (string | undefined)[]; tekst: string };
const index = new WeakMap<Item, Zoektekst>();

function zoektekst(item: Item): string {
  const velden = [item.kop, item.ai, item.samenvatting, ...(item.punten ?? []), ...(item.bronnen ?? []).map((bron) => bron.site), CAT_LABEL[item.cat]];
  const bewaard = index.get(item);
  if (bewaard && velden.length === bewaard.velden.length && velden.every((veld, i) => veld === bewaard.velden[i])) return bewaard.tekst;
  const tekst = normaliseer(velden.filter(Boolean).join(" "));
  index.set(item, { velden, tekst });
  return tekst;
}

export function zoekItems(items: Item[], query: string): Item[] {
  const woorden = normaliseer(query).split(" ").filter(Boolean);
  if (!woorden.length) return items;
  return items.filter((item) => {
    // Woordbegin: " " ervoor zodat "kat" niet in "politiek" valt, maar wel "katten" vindt.
    const haystack = " " + zoektekst(item);
    return woorden.every((woord) => haystack.includes(" " + woord));
  });
}
