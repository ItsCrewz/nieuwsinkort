import { artikelSlug } from "./artikelid";
import type { Bron, Item } from "./types";

const slugify = artikelSlug;
export const itemKey = (i: Item) => slugify(i.kop) || i.bronnen?.[0]?.href || i.kop;

export function bronLabel(bronnen: Bron[]) {
  const names: string[] = [];
  for (const b of bronnen ?? []) if (!names.includes(b.site)) names.push(b.site);
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  return `${names[0]} + ${names.length - 1}`;
}

export function sortItems(items: Item[]) {
  return items.slice().sort((a, b) => {
    if (!a.tijd !== !b.tijd) return a.tijd ? -1 : 1;
    return a.tijd < b.tijd ? 1 : a.tijd > b.tijd ? -1 : 0;
  });
}
// Openingsverhaal: het bericht met de meeste bronnen (meest gedekt), bij gelijkspel het nieuwste.
export function pickLead(sorted: Item[]) {
  let best = -1;
  let n = -1;
  sorted.forEach((it, i) => {
    const c = new Set((it.bronnen ?? []).map((b) => b.site)).size;
    if (c > n) {
      n = c;
      best = i;
    }
  });
  return best;
}

