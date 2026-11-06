import { CAT_LABEL } from "./tabs";
import type { Item } from "./types";

export function normaliseer(tekst: string): string {
  return tekst.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
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

export function zoekItems(items: Item[], query: string): Item[] {
  const woorden = normaliseer(query).split(" ").filter(Boolean);
  if (!woorden.length) return items;
  return items.filter((item) => {
    const tekst = normaliseer([item.kop, item.ai, item.samenvatting, ...(item.punten ?? []), ...(item.bronnen ?? []).map((bron) => bron.site), CAT_LABEL[item.cat]].filter(Boolean).join(" "));
    // Woordbegin: elke term moet op een eigen woord vallen ("mark markt" vraagt twee woorden).
    return alleTermenPassen(woorden, tekst.split(" "));
  });
}
