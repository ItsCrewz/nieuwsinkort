import { CAT_LABEL } from "./tabs";
import type { Item } from "./types";

// Letters die NFD niet ontleedt: beperkte transliteratie zodat "Soren" ook "Søren" vindt (#735).
const LETTERVARIANT: Record<string, string> = { "ø": "o", "ł": "l", "æ": "ae", "œ": "oe", "đ": "d", "ß": "ss" };

export function normaliseer(tekst: string): string {
  return tekst.normalize("NFD").replace(/(\p{Script=Latin})\p{M}+/gu, "$1").toLowerCase().replace(/[øłæœđß]/g, (c) => LETTERVARIANT[c]).replace(/[^\p{L}\p{M}\p{N}]+/gu, " ").trim();
}

// Koppelteken tussen twee letters/cijfers, behalve tussen twee losse tekens ("V-S" blijft geen "VS"): "corona-maatregelen" is dezelfde samenstelling als "coronamaatregelen".
const KOPPEL = /(?<=[\p{L}\p{N}]{2})[-\u2010\u2011](?=[\p{L}\p{N}])|(?<=[\p{L}\p{N}])[-\u2010\u2011](?=[\p{L}\p{N}]{2})/gu;

// "N.O.S." wordt ook als "NOS" doorzoekbaar (zowel in de zoekterm als in de tekst).
function afkortingen(tekst: string): string {
  return tekst.replace(/(?<![\p{L}\p{N}])(?:\p{L}\.)+\p{L}\.?(?![\p{L}\p{N}])/gu, (afkorting) => afkorting.replace(/\./g, ""));
}

export function zoekItems(items: Item[], query: string): Item[] {
  // Per zoekterm (gescheiden door spaties) de alternatieven: losse woorden, of bij een term met koppelteken
  // de aaneengesloten reeks of de aaneengeschreven vorm.
  const termen = afkortingen(query).split(/\s+/).map((t) => ({ delen: normaliseer(t).split(" ").filter(Boolean), koppel: /[\p{L}\p{N}][-\u2010\u2011][\p{L}\p{N}]/u.test(t) })).filter((t) => t.delen.length);
  if (!termen.length) return query.trim() ? [] : items;
  return items.filter((item) => {
    const velden = [item.kop, item.ai, item.samenvatting, ...(item.punten ?? []), ...(item.bronnen ?? []).map((bron) => bron.site), CAT_LABEL[item.cat]].filter(Boolean).map((v) => v + " " + afkortingen(v as string)) as string[];
    // Woordbegin: " " ervoor zodat "kat" niet in "politiek" valt, maar wel "katten" vindt.
    // " | " tussen velden: een reeks uit een koppelterm loopt nooit over veldgrenzen.
    const haystack = " " + velden.map(normaliseer).join(" | ");
    // Variant waarin koppeltekens verdwijnen, zodat "coronamaatregelen" ook "corona-maatregelen" vindt.
    const samen = " " + velden.map((v) => normaliseer(v.replace(KOPPEL, ""))).join(" | ");
    return termen.every(({ delen, koppel }) => {
      if (!koppel || delen.length === 1) return delen.every((w) => haystack.includes(" " + w) || samen.includes(" " + w));
      return haystack.includes(" " + delen.join(" ")) || samen.includes(" " + delen.join(""));
    });
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
