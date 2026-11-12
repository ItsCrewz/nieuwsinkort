import { CAT_LABEL } from "./tabs";
import type { Item } from "./types";

// Letters die NFD niet ontleedt: beperkte transliteratie zodat "Soren" ook "Søren" vindt (#735).
const LETTERVARIANT: Record<string, string> = { "ø": "o", "ł": "l", "æ": "ae", "œ": "oe", "đ": "d", "ß": "ss" };

export function normaliseer(tekst: string): string {
  return tekst.normalize("NFD").replace(/(\p{Script=Latin})\p{M}+/gu, "$1").toLowerCase().replace(/[øłæœđß]/g, (c) => LETTERVARIANT[c])
    .replace(/(?<![\p{L}\p{N}])c(?:\+\+|#)(?![\p{L}\p{N}+#])|[^\p{L}\p{M}\p{N}]+/gu, (deel) => deel === "c++" || deel === "c#" ? deel : " ").trim();
}

// Koppelteken tussen twee letters/cijfers, behalve tussen twee losse tekens ("V-S" blijft geen "VS"): "corona-maatregelen" is dezelfde samenstelling als "coronamaatregelen".
const KOPPEL = /(?<=[\p{L}\p{N}]{2})[-\u2010\u2011](?=[\p{L}\p{N}])|(?<=[\p{L}\p{N}])[-\u2010\u2011](?=[\p{L}\p{N}]{2})/gu;

// "N.O.S." wordt ook als "NOS" doorzoekbaar (zowel in de zoekterm als in de tekst).
function afkortingen(tekst: string): string {
  return tekst.replace(/(?<![\p{L}\p{N}])(?:\p{L}\.)+\p{L}\.?(?![\p{L}\p{N}])/gu, (afkorting) => afkorting.replace(/\./g, ""));
}

// Koppelteken in de zoekterm: ook tussen losse tekens ("v-s" blijft een reeks van twee delen).
const TERMKOPPEL = /(?<=[\p{L}\p{N}])[-\u2010\u2011](?=[\p{L}\p{N}])/gu;
const MARKER = "\u0001";

// Woorden van de velden (leeg woord als veldgrens) en welke woorden met een koppelteken aan het volgende vastzitten.
function woordenVan(velden: string[], koppel: RegExp): { woorden: string[]; lijm: boolean[] } {
  const woorden: string[] = [], lijm: boolean[] = [];
  for (const veld of velden) {
    let vorige = false;
    for (const stuk of afkortingen(veld).normalize("NFC").replace(koppel, MARKER).split(MARKER)) {
      const delen = normaliseer(stuk).split(" ").filter(Boolean);
      if (!delen.length) { vorige = false; continue; }
      if (vorige) lijm[lijm.length - 1] = true;
      for (const d of delen) { woorden.push(d); lijm.push(false); }
      vorige = true;
    }
    woorden.push(""); lijm.push(false);
  }
  return { woorden, lijm };
}

type Zoektekst = { velden: (string | undefined)[]; woorden: string[]; lijm: boolean[] };
const index = new WeakMap<Item, Zoektekst>();

function zoektekst(item: Item): Zoektekst {
  const velden = [item.kop, item.ai, item.samenvatting, ...(item.punten ?? []), ...(item.bronnen ?? []).map((bron) => bron.site), CAT_LABEL[item.cat]];
  const bewaard = index.get(item);
  if (bewaard && velden.length === bewaard.velden.length && velden.every((veld, i) => veld === bewaard.velden[i])) return bewaard;
  const resultaat = { velden, ...woordenVan(velden.filter(Boolean) as string[], KOPPEL) };
  index.set(item, resultaat);
  return resultaat;
}

// Exact i.p.v. woordbegin: c++/c# en volledig numerieke termen (2024 vindt geen 20240, 20 geen 2026).
const speciaal = (term: string) => term === "c++" || term === "c#" || /^\p{N}+$/u.test(term);
const past = (term: string, woord: string) => speciaal(term) || woord === "c++" || woord === "c#" ? woord === term : woord.startsWith(term);

// Reeksen [begin, eind] waarop een term past. Aaneengeschreven vorm: één woord, of woorden met koppelteken ("coronamaatregelen" = "corona-maatregelen").
function kandidaten(delen: string[], woorden: string[], lijm: boolean[]): [number, number][] {
  const uit: [number, number][] = [];
  const samen = delen.join("");
  for (let i = 0; i < woorden.length; i++) {
    let c = "", m = i;
    for (; m < woorden.length; m++) {
      c += woorden[m];
      if (c.length >= samen.length || !samen.startsWith(c) || speciaal(samen) || !lijm[m]) break;
    }
    if (m < woorden.length && (m === i ? past(samen, woorden[i]) : c.length >= samen.length && c.startsWith(samen))) uit.push([i, m]);
    if (delen.length > 1 && i + delen.length <= woorden.length && delen.every((d, k) => k < delen.length - 1 ? woorden[i + k] === d : past(d, woorden[i + k]))) uit.push([i, i + delen.length - 1]);
  }
  return uit;
}

// Termen met een reeks van meerdere woorden worden doorgeprobeerd (zeldzaam); losse woorden gaan door een bipartiete koppeling (Kuhn), zodat de uitkomst niet van de termvolgorde afhangt.
function alleTermenPassen(kand: [number, number][][], aantal: number): boolean {
  const bezet = new Array<boolean>(aantal).fill(false);
  const los = (termen: number[]): boolean => {
    const eigenaar: number[] = new Array(aantal).fill(-1);
    const plaats = (t: number, gezien: boolean[]): boolean => {
      for (const [w] of kand[t]) {
        if (gezien[w] || bezet[w]) continue;
        gezien[w] = true;
        if (eigenaar[w] < 0 || plaats(eigenaar[w], gezien)) { eigenaar[w] = t; return true; }
      }
      return false;
    };
    return termen.every((t) => plaats(t, []));
  };
  const kies = (t: number, uitgesteld: number[]): boolean => {
    if (t === kand.length) return los(uitgesteld);
    const enkel = kand[t].filter(([b, e]) => b === e);
    const meer = kand[t].filter(([b, e]) => b !== e);
    for (const [b, e] of meer) {
      let vrij = true;
      for (let w = b; w <= e; w++) if (bezet[w]) vrij = false;
      if (!vrij) continue;
      for (let w = b; w <= e; w++) bezet[w] = true;
      const goed = kies(t + 1, uitgesteld);
      for (let w = b; w <= e; w++) bezet[w] = false;
      if (goed) return true;
    }
    return enkel.length > 0 && kies(t + 1, [...uitgesteld, t]);
  };
  return kies(0, []);
}

export function zoekItems(items: Item[], query: string): Item[] {
  // Alleen gekoppelde woorddelen vormen een reeks; andere leestekens scheiden zoekwoorden.
  const termen: string[][] = [];
  // Het stuurteken \u0001 is bewust de markering voor termkoppeltekens (#811).
  // eslint-disable-next-line no-control-regex
  for (const token of afkortingen(query).normalize("NFC").replace(TERMKOPPEL, MARKER).split(/[^\p{L}\p{M}\p{N}+#\u0001]+/u)) {
    const delen = token.split(MARKER).flatMap((stuk) => normaliseer(stuk).split(" ").filter(Boolean));
    if (token.includes(MARKER) && delen.length > 1) termen.push(delen); else for (const d of delen) termen.push([d]);
  }
  if (!termen.length) return query.trim() ? [] : items;
  return items.filter((item) => {
    const { woorden, lijm } = zoektekst(item);
    // Woordbegin: elke term moet op een eigen woord (of eigen reeks) vallen ("mark markt" vraagt twee woorden).
    const kand = termen.map((delen) => kandidaten(delen, woorden, lijm));
    return kand.every((k) => k.length) && alleTermenPassen(kand, woorden.length);
  });
}

export function resultaatTekst(aantal: number): string {
  return `${aantal} ${aantal === 1 ? "resultaat" : "resultaten"}`;
}

// Zoekscope (#613): binnen welke rubriek en filters wordt gezocht, en hoeveel treffers de filters verbergen.
export function scopeTekst(s: { rubriek: string; zonderPolitiek: boolean; tijd: string; bronnenUit: number }): string {
  return ["Zoekt in " + s.rubriek + (s.zonderPolitiek ? " (zonder Politiek)" : ""), s.tijd, ...(s.bronnenUit ? [`${s.bronnenUit} ${s.bronnenUit === 1 ? "bron" : "bronnen"} uit`] : [])].join(" · ");
}
export function verborgenTekst(aantal: number): string {
  return `${aantal} ${aantal === 1 ? "treffer" : "treffers"} verborgen door filters`;
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
