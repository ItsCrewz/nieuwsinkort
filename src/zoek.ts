import { CAT_LABEL } from "./tabs";
import type { Item } from "./types";

// Letters die NFD niet ontleedt: beperkte transliteratie zodat "Soren" ook "Søren" vindt (#735).
const LETTERVARIANT: Record<string, string> = { "ø": "o", "ł": "l", "æ": "ae", "œ": "oe", "đ": "d", "ß": "ss" };

export function normaliseer(tekst: string): string {
  return tekst.normalize("NFD").replace(/(\p{Script=Latin})\p{M}+/gu, "$1").toLowerCase().replace(/[øłæœđß]/g, (c) => LETTERVARIANT[c]).replace(/[^\p{L}\p{M}\p{N}]+/gu, " ").trim();
}

// Bipartiete koppeling (Kuhn): de uitkomst hangt zo niet af van de volgorde van de termen.
function alleTermenPassen(termen: string[], tekstWoorden: string[]): boolean {
  const eigenaar: number[] = new Array(tekstWoorden.length).fill(-1);
  const plaats = (t: number, gezien: boolean[]): boolean => {
    for (let w = 0; w < tekstWoorden.length; w++) {
      if (gezien[w] || !tekstWoorden[w].startsWith(termen[t])) continue;
      gezien[w] = true;
      if (eigenaar[w] < 0 || plaats(eigenaar[w], gezien)) { eigenaar[w] = t; return true; }
    }
    return false;
  };
  return termen.every((_, t) => plaats(t, []));
}

function afkortingen(tekst: string): string {
  return tekst.replace(/(?<![\p{L}\p{N}])(?:\p{L}\.)+\p{L}\.?(?![\p{L}\p{N}])/gu, (afkorting) => afkorting.replace(/\./g, ""));
}

export function zoekItems(items: Item[], query: string): Item[] {
  const woorden = normaliseer(afkortingen(query)).split(" ").filter(Boolean);
  if (!woorden.length) return query.trim() ? [] : items;
  return items.filter((item) => {
    const origineel = [item.kop, item.ai, item.samenvatting, ...(item.punten ?? []), ...(item.bronnen ?? []).map((bron) => bron.site), CAT_LABEL[item.cat]].filter(Boolean).join(" ");
    const tekst = normaliseer(afkortingen(origineel));
    // Woordbegin: elke term moet op een eigen woord vallen ("mark markt" vraagt twee woorden).
    return alleTermenPassen(woorden, tekst.split(" "));
  });
}
