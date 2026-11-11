import { CAT_LABEL } from "./tabs";
import type { Item } from "./types";

// Letters die NFD niet ontleedt: beperkte transliteratie zodat "Soren" ook "Søren" vindt (#735).
const LETTERVARIANT: Record<string, string> = { "ø": "o", "ł": "l", "æ": "ae", "œ": "oe", "đ": "d", "ß": "ss" };

export function normaliseer(tekst: string): string {
  return tekst.normalize("NFD").replace(/(\p{Script=Latin})\p{M}+/gu, "$1").toLowerCase().replace(/[øłæœđß]/g, (c) => LETTERVARIANT[c])
    .replace(/(?<![\p{L}\p{N}])c(?:\+\+|#)(?![\p{L}\p{N}+#])|[^\p{L}\p{M}\p{N}]+/gu, (deel) => deel === "c++" || deel === "c#" ? deel : " ").trim();
}

// Bipartiete koppeling (Kuhn): de uitkomst hangt zo niet af van de volgorde van de termen.
function alleTermenPassen(termen: string[], tekstWoorden: string[]): boolean {
  const eigenaar: number[] = new Array(tekstWoorden.length).fill(-1);
  const plaats = (t: number, gezien: boolean[]): boolean => {
    for (let w = 0; w < tekstWoorden.length; w++) {
      // Exact i.p.v. woordbegin: c++/c# en volledig numerieke termen (2024 vindt geen 20240, 20 geen 2026).
      const speciaal = termen[t] === "c++" || termen[t] === "c#" || tekstWoorden[w] === "c++" || tekstWoorden[w] === "c#" || /^\p{N}+$/u.test(termen[t]);
      if (gezien[w] || (speciaal ? tekstWoorden[w] !== termen[t] : !tekstWoorden[w].startsWith(termen[t]))) continue;
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
  const groepen: string[] = [];
  const los = query.replace(/"([^"]*)"/g, (_, groep: string) => {
    const tekst = normaliseer(afkortingen(groep));
    if (tekst) groepen.push(tekst);
    return " ";
  });
  const woorden = normaliseer(afkortingen(los)).split(" ").filter(Boolean);
  if (!woorden.length && !groepen.length) return query.replace(/"/g, "").trim() ? [] : items;
  return items.filter((item) => {
    const velden = [item.kop, item.ai, item.samenvatting, ...(item.punten ?? []), ...(item.bronnen ?? []).map((bron) => bron.site), CAT_LABEL[item.cat]].filter(Boolean).map((veld) => normaliseer(afkortingen(veld!)));
    // Elke losse term moet op een eigen woord vallen; woordgroepen blijven binnen één veld.
    return alleTermenPassen(woorden, velden.join(" ").split(" ")) && groepen.every((groep) => velden.some((veld) => veld.includes(groep)));
  });
}

// Bewaar de oorspronkelijke tekstposities bij accentongevoelig vergelijken.
export function markeerDelen(tekst: string, query: string): { tekst: string; markeer: boolean }[] {
  const woorden = normaliseer(query).split(" ").filter(Boolean);
  const posities: { begin: number; eind: number }[] = [];
  let vlak = "", offset = 0;
  for (const teken of tekst) {
    const begin = offset;
    offset += teken.length;
    const genormaliseerd = teken.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
    if (!genormaliseerd && posities.length) posities[posities.length - 1].eind = offset;
    for (const letter of genormaliseerd) {
      vlak += letter;
      for (let i = 0; i < letter.length; i++) posities.push({ begin, eind: offset });
    }
  }
  const bereiken: { begin: number; eind: number }[] = [];
  for (const woord of woorden) {
    let vanaf = 0, index: number;
    while ((index = vlak.indexOf(woord, vanaf)) !== -1) {
      if (index === 0 || !/[\p{L}\p{M}\p{N}]$/u.test(vlak.slice(0, index))) {
        bereiken.push({ begin: posities[index].begin, eind: posities[index + woord.length - 1].eind });
      }
      vanaf = index + 1;
    }
  }
  bereiken.sort((a, b) => a.begin - b.begin || a.eind - b.eind);
  const delen: { tekst: string; markeer: boolean }[] = [];
  let eind = 0;
  for (let i = 0; i < bereiken.length; i++) {
    const bereik = bereiken[i];
    while (i + 1 < bereiken.length && bereiken[i + 1].begin <= bereik.eind) bereik.eind = Math.max(bereik.eind, bereiken[++i].eind);
    if (bereik.begin > eind) delen.push({ tekst: tekst.slice(eind, bereik.begin), markeer: false });
    delen.push({ tekst: tekst.slice(bereik.begin, bereik.eind), markeer: true });
    eind = bereik.eind;
  }
  if (eind < tekst.length) delen.push({ tekst: tekst.slice(eind), markeer: false });
  return delen;
}
