import type { Bron, Item, Meer } from "./types";

export type BronnenPunt = { tekst: string; bronnen: Bron[] };
const stop = new Set("de het een en in van op aan voor bij met is zijn was waren om door na als dat die deze dit te uit naar over tot zich heeft hebben werd worden er ook nog al hun haar vanwege".split(" "));
const schoon = (s: string) => s.replace(/[\u200b-\u200f\u2060\ufeff\ufffd]/g, "").replace(/\s+/g, " ").trim();
const woorden = (s: string) => new Set(s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().match(/[a-z0-9]+/g)?.filter((w) => !stop.has(w)) ?? []);
const kenmerken = (s: string) => (s.toLowerCase().match(/\d+(?:[.,:-]\d+)*|\b(?:niet|geen|ontkent|ontkennen|ontkende|ontkend)\b/g) ?? []).join(" ");
const gelijk = (a: string, b: string) => {
  if (kenmerken(a) !== kenmerken(b)) return false;
  const wa = woorden(a), wb = woorden(b);
  const gemeen = [...wa].filter((w) => wb.has(w)).length;
  return gemeen >= 2 && gemeen / wa.size >= 0.75 && gemeen / wb.size >= 0.75;
};
const sleutel = (s: string) => s.trim().toLowerCase();
const zinnen = (s: string) => s.match(/[^.!?]+[.!?]+(?=\s|$)/g) ?? [];

/** Combineert beschikbare artikelpunten en volledige feedzinnen per uitgever. */
export function bronnenPunten(item: Item, meer: Meer | null): BronnenPunt[] {
  const bronnen = (item.bronnen ?? []).filter((b, i, alle) => alle.findIndex((x) => sleutel(x.site) === sleutel(b.site)) === i);
  if (bronnen.length < 2 && !meer?.perBron?.length) return [];
  const punten: (BronnenPunt & { teksten: string[]; volgorde: number })[] = [];
  for (const bron of bronnen) {
    const ai = meer?.perBron?.find((b) => sleutel(b.site) === sleutel(bron.site));
    const titel = schoon(bron.ft ?? "").replace(/^[^|]{1,40}\|\s*/, "");
    for (const tekst of [...(ai?.punten ?? []), titel, ...zinnen(bron.fd ?? "")].map(schoon)) {
      if (tekst.length < 25 || /^(?:volg\b.*\b(?:ons|het) liveblog\b|lees meer\b)/i.test(tekst) || !woorden(tekst).size) continue;
      const bestaand = punten.find((p) => p.teksten.every((t) => gelijk(t, tekst)));
      if (bestaand) {
        if (!bestaand.bronnen.includes(bron)) bestaand.bronnen.push(bron);
        bestaand.teksten.push(tekst);
      } else punten.push({ tekst, bronnen: [bron], teksten: [tekst], volgorde: punten.length });
    }
  }
  const boven = [item.kop, ...zinnen(item.samenvatting ?? ""), ...zinnen(item.ai ?? "")];
  const aantallen = new Map(bronnen.map((bron) => [bron, punten.filter((p) => p.bronnen.includes(bron)).length]));
  const zichtbaar = punten.filter((p) => {
    if (!boven.some((tekst) => gelijk(p.tekst, tekst)) || p.bronnen.some((bron) => aantallen.get(bron)! <= 1)) return true;
    for (const bron of p.bronnen) aantallen.set(bron, aantallen.get(bron)! - 1);
    return false;
  });
  return zichtbaar.sort((a, b) => b.bronnen.length - a.bronnen.length || a.volgorde - b.volgorde).map(({ tekst, bronnen: bs }) => ({ tekst, bronnen: bs.map(({ site, href }) => ({ site, href })) }));
}
