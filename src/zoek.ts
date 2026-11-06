import { CAT_LABEL } from "./tabs";
import type { Item } from "./types";

export function normaliseer(tekst: string): string {
  return tekst.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

// Koppelteken tussen twee letters/cijfers: "corona-maatregelen" is dezelfde samenstelling als "coronamaatregelen".
const KOPPEL = /(?<=[\p{L}\p{N}])[-\u2010\u2011](?=[\p{L}\p{N}])/gu;

export function zoekItems(items: Item[], query: string): Item[] {
  // Per zoekterm (gescheiden door spaties) de alternatieven: losse woorden, of bij een term met koppelteken
  // de aaneengesloten reeks of de aaneengeschreven vorm.
  const termen = query.split(/\s+/).map((t) => ({ delen: normaliseer(t).split(" ").filter(Boolean), koppel: /[\p{L}\p{N}][-\u2010\u2011][\p{L}\p{N}]/u.test(t) })).filter((t) => t.delen.length);
  if (!termen.length) return items;
  return items.filter((item) => {
    const velden = [item.kop, item.ai, item.samenvatting, ...(item.punten ?? []), ...(item.bronnen ?? []).map((bron) => bron.site), CAT_LABEL[item.cat]].filter(Boolean) as string[];
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
