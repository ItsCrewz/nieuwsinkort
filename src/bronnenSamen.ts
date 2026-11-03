import type { Bron, Item, Meer } from "./types";

export type BronnenPunt = { tekst: string; bronnen: Bron[] };
const stop = new Set("de het een en in van op aan voor bij met is zijn was waren om door na als dat die deze dit te uit naar over tot zich heeft hebben werd worden er ook nog al hun zijn haar niet voor vanwege".split(" "));
const schoon = (s: string) => s.replace(/[\u200b-\u200f\u2060\ufeff\ufffd]/g, "").replace(/\s+/g, " ").trim();
const woorden = (s: string) => new Set(s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().match(/[a-z0-9]+/g)?.map((w) => w === "hotelgasten" ? "gasten" : w === "amsterdams" ? "amsterdam" : w).filter((w) => !stop.has(w)) ?? []);
const gelijk = (a: Set<string>, b: Set<string>) => {
  const gemeen = [...a].filter((w) => b.has(w)).length;
  return gemeen >= 2 && (gemeen / Math.min(a.size, b.size) >= 0.7 || gemeen / (a.size + b.size - gemeen) >= 0.5);
};
const sleutel = (s: string) => s.trim().toLowerCase();

/** Combineert beschikbare artikelpunten en volledige feedzinnen per uitgever. */
export function bronnenPunten(item: Item, meer: Meer | null): BronnenPunt[] {
  const bronnen = (item.bronnen ?? []).filter((b, i, alle) => alle.findIndex((x) => sleutel(x.site) === sleutel(b.site)) === i);
  if (bronnen.length < 2 && !meer?.perBron?.length) return [];
  const punten: (BronnenPunt & { woorden: Set<string>; volgorde: number })[] = [];
  const kop = schoon(item.kop).toLowerCase();
  for (const bron of bronnen) {
    const ai = meer?.perBron?.find((b) => sleutel(b.site) === sleutel(bron.site));
    const titel = schoon(bron.ft ?? "").replace(/^(?:(?:video|live|explainer|update)\s*\|\s*)+/i, "");
    const zinnen = (bron.fd ?? "").match(/[^.!?]+[.!?]+(?=\s|$)/g) ?? [];
    for (const tekst of [...(ai?.punten ?? []), titel, ...zinnen].map(schoon)) {
      if (tekst.length < 25 || tekst.toLowerCase() === kop) continue;
      const w = woorden(tekst);
      if (!w.size) continue;
      const bestaand = punten.find((p) => gelijk(p.woorden, w));
      if (bestaand) {
        if (!bestaand.bronnen.includes(bron)) bestaand.bronnen.push(bron);
        if (tekst.length > bestaand.tekst.length) { bestaand.tekst = tekst; bestaand.woorden = w; }
      } else punten.push({ tekst, bronnen: [bron], woorden: w, volgorde: punten.length });
    }
  }
  return punten.sort((a, b) => b.bronnen.length - a.bronnen.length || a.volgorde - b.volgorde).slice(0, 8).map(({ tekst, bronnen: bs }) => ({ tekst, bronnen: bs.map(({ site, href }) => ({ site, href })) }));
}
