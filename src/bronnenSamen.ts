import type { Bron, Item, Meer } from "./types";

export type BronnenPunt = { tekst: string; bronnen: Bron[] };
const stop = new Set("de het een en in van op aan voor bij met is zijn was waren om door na als dat die deze dit te uit naar over tot zich heeft hebben werd worden er ook nog al hun haar vanwege".split(" "));
const schoon = (s: string) => s.replace(/[\u200b-\u200f\u2060\ufeff\ufffd]/g, "").replace(/\s+/g, " ").trim();
const woorden = (s: string) => new Set(s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().match(/[a-z0-9]+/g)?.filter((w) => !stop.has(w)) ?? []);
const matchWoord = (a: string, b: string) => a === b || (a.length >= 5 && b.length >= 5 && (a.slice(0, 5) === b.slice(0, 5) || a.endsWith(b) || b.endsWith(a)));
const getallen = (s: string) => new Set(s.match(/\d+(?:[.,:-]\d+)*/g) ?? []);
const ontkenning = (s: string) => (s.toLowerCase().match(/\b(?:niet|geen|ontkent|ontkennen|ontkende|ontkend)\b/g) ?? []).sort().join(" ");
// De kortste bewering moet door de langere tekst worden gedragen.
const gelijk = (a: string, b: string) => {
  const wa = woorden(a), wb = woorden(b);
  const [kort, lang] = wa.size <= wb.size ? [wa, wb] : [wb, wa];
  const [ks, ls] = wa.size <= wb.size ? [a, b] : [b, a];
  if (ontkenning(a) !== ontkenning(b) || [...getallen(ks)].some((n) => !getallen(ls).has(n))) return false;
  const gemeen = [...kort].filter((w) => [...lang].some((v) => matchWoord(w, v))).length;
  return gemeen >= 3 && gemeen / kort.size >= 0.6;
};
const sleutel = (s: string) => s.trim().toLowerCase();
const zinnen = (s: string) => s.match(/[^.!?]+[.!?]+(?=\s|$)/g) ?? [];

/** Combineert beschikbare artikelpunten en volledige feedzinnen per uitgever. */
export function bronnenPunten(item: Item, meer: Meer | null): BronnenPunt[] {
  const bronnen = (item.bronnen ?? []).filter((b, i, alle) => alle.findIndex((x) => sleutel(x.site) === sleutel(b.site)) === i);
  if (bronnen.length < 2 && !meer?.perBron?.length) return [];
  const kandidaten: { tekst: string; bron: Bron; volgorde: number }[] = [];
  for (const bron of bronnen) {
    const ai = meer?.perBron?.find((b) => sleutel(b.site) === sleutel(bron.site));
    const titel = schoon(bron.ft ?? "").replace(/^[^|]{1,40}\|\s*/, "");
    const bruikbaar = (tekst: string) => tekst.length >= 25 && !/^(?:volg\b.*\b(?:ons|het) liveblog\b|lees meer\b)/i.test(tekst) && woorden(tekst).size > 0;
    const teksten = [...(ai?.punten ?? []), ...zinnen(bron.fd ?? "")].map(schoon).filter(bruikbaar);
    if (!teksten.length && bruikbaar(titel)) teksten.push(titel);
    for (const tekst of teksten) kandidaten.push({ tekst, bron, volgorde: kandidaten.length });
  }
  // Eerst de minst specifieke variant, zodat ieder toegevoegd label die tekst dekt.
  kandidaten.sort((a, b) => woorden(a.tekst).size - woorden(b.tekst).size || a.tekst.length - b.tekst.length || a.volgorde - b.volgorde);
  const punten: (BronnenPunt & { volgorde: number })[] = [];
  for (const kandidaat of kandidaten) {
    const bestaand = punten.find((p) => gelijk(p.tekst, kandidaat.tekst));
    if (bestaand) {
      if (!bestaand.bronnen.includes(kandidaat.bron)) bestaand.bronnen.push(kandidaat.bron);
      bestaand.volgorde = Math.min(bestaand.volgorde, kandidaat.volgorde);
    } else punten.push({ tekst: kandidaat.tekst, bronnen: [kandidaat.bron], volgorde: kandidaat.volgorde });
  }
  // Een titel kan een bestaande, kortere bewering ondersteunen zonder zelf een punt te worden.
  for (const punt of punten) for (const bron of bronnen) {
    const titel = schoon(bron.ft ?? "").replace(/^[^|]{1,40}\|\s*/, "");
    if (!punt.bronnen.includes(bron) && woorden(punt.tekst).size <= woorden(titel).size && gelijk(punt.tekst, titel)) punt.bronnen.push(bron);
  }
  const boven = [item.kop, ...zinnen(item.samenvatting ?? ""), ...zinnen(item.ai ?? "")];
  const aantallen = new Map(bronnen.map((bron) => [bron, punten.filter((p) => p.bronnen.includes(bron)).length]));
  const zichtbaar = punten.filter((p) => {
    if (p.bronnen.length > 1 || !boven.some((tekst) => gelijk(p.tekst, tekst)) || p.bronnen.some((bron) => aantallen.get(bron)! <= 1)) return true;
    for (const bron of p.bronnen) aantallen.set(bron, aantallen.get(bron)! - 1);
    return false;
  });
  return zichtbaar.sort((a, b) => b.bronnen.length - a.bronnen.length || a.volgorde - b.volgorde).map(({ tekst, bronnen: bs }) => ({ tekst, bronnen: bs.sort((a, b) => bronnen.indexOf(a) - bronnen.indexOf(b)).map(({ site, href }) => ({ site, href })) }));
}
