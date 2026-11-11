import { CAT_LABEL } from "./tabs";
import type { Item } from "./types";

// Letters die NFD niet ontleedt: beperkte transliteratie zodat "Soren" ook "Søren" vindt (#735).
const LETTERVARIANT: Record<string, string> = { "ø": "o", "ł": "l", "æ": "ae", "œ": "oe", "đ": "d", "ß": "ss" };

export function normaliseer(tekst: string): string {
  return tekst.normalize("NFD").replace(/(\p{Script=Latin})\p{M}+/gu, "$1").toLowerCase().replace(/[øłæœđß]/g, (c) => LETTERVARIANT[c]).replace(/[^\p{L}\p{M}\p{N}]+/gu, " ").trim();
}

function afkortingen(tekst: string): string {
  return tekst.replace(/(?<![\p{L}\p{N}])(?:\p{L}\.)+\p{L}\.?(?![\p{L}\p{N}])/gu, (afkorting) => afkorting.replace(/\./g, ""));
}

type Zoektekst = { velden: (string | undefined)[]; tekst: string };
const index = new WeakMap<Item, Zoektekst>();

function zoektekst(item: Item): string {
  const velden = [item.kop, item.ai, item.samenvatting, ...(item.punten ?? []), ...(item.bronnen ?? []).map((bron) => bron.site), CAT_LABEL[item.cat]];
  const bewaard = index.get(item);
  if (bewaard && velden.length === bewaard.velden.length && velden.every((veld, i) => veld === bewaard.velden[i])) return bewaard.tekst;
  const origineel = velden.filter(Boolean).join(" ");
  const tekst = normaliseer(origineel + " " + afkortingen(origineel));
  index.set(item, { velden, tekst });
  return tekst;
}

export function zoekItems(items: Item[], query: string): Item[] {
  const woorden = normaliseer(afkortingen(query)).split(" ").filter(Boolean);
  if (!woorden.length) return query.trim() ? [] : items;
  return items.filter((item) => {
    // Woordbegin: " " ervoor zodat "kat" niet in "politiek" valt, maar wel "katten" vindt.
    const haystack = " " + zoektekst(item);
    return woorden.every((woord) => haystack.includes(" " + woord));
  });
}
