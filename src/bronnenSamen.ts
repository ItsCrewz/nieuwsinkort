import type { Bron, Item, Meer } from "./types";

export type BronnenPunt = { tekst: string; bronnen: Bron[] };
const stop = new Set("de het een en in van op aan voor bij met is zijn was waren om door na als dat die deze dit te uit naar over tot zich heeft hebben werd worden er ook nog al hun haar vanwege".split(" "));
const schoon = (s: string) => s.replace(/[\u200b-\u200f\u2060\ufeff\ufffd]/g, "").replace(/\s+/g, " ").trim();
const woorden = (s: string) => new Set(s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().match(/[a-z0-9]+/g)?.filter((w) => !stop.has(w)) ?? []);
const matchWoord = (a: string, b: string) => a === b || (a.length >= 5 && b.length >= 5 && (a.slice(0, 5) === b.slice(0, 5) || a.endsWith(b) || b.endsWith(a)));
const getallen = (s: string) => new Set(s.match(/\d+(?:[.,:-]\d+)*/g) ?? []);
const feiten = (s: string) => new Set((s.match(/\d+(?:[.,:-]\d+)*|(?<![\p{L}])(?:één|twee|drie|vier|vijf|zes|zeven|acht|negen|tien)(?![\p{L}])/giu) ?? []).map((w) => w.toLowerCase()));
const namen = (s: string) => new Set((s.match(/\b[\p{L}][\p{L}\p{M}]*\b/gu) ?? []).filter((w, i) => (i > 0 && /^\p{Lu}/u.test(w)) || (/^\p{Lu}{2,}$/u.test(w))).map((w) => w.toLowerCase()));
const dekt = (punt: string, tekst: string) => {
  const inhoud = woorden(punt), eigen = woorden(tekst), ns = namen(tekst), gs = feiten(tekst);
  return inhoud.size > 0 && [...inhoud].filter((w) => [...eigen].some((v) => matchWoord(w, v))).length / inhoud.size >= 0.85
    && [...feiten(punt)].every((w) => gs.has(w)) && [...namen(punt)].every((w) => ns.has(w) || new RegExp(`(?:^|[^\\p{L}])${w}(?:$|[^\\p{L}])`, "iu").test(tekst));
};
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
  const groepen: { kandidaten: typeof kandidaten; volgorde: number }[] = [];
  kandidaten.sort((a, b) => woorden(a.tekst).size - woorden(b.tekst).size || a.tekst.length - b.tekst.length || a.volgorde - b.volgorde);
  for (const kandidaat of kandidaten) {
    const groep = groepen.find((g) => gelijk(g.kandidaten[0].tekst, kandidaat.tekst));
    if (groep) { groep.kandidaten.push(kandidaat); groep.volgorde = Math.min(groep.volgorde, kandidaat.volgorde); }
    else groepen.push({ kandidaten: [kandidaat], volgorde: kandidaat.volgorde });
  }
  const eigenTeksten = (bron: Bron) => [bron.ft?.replace(/^[^|]{1,40}\|\s*/, "") ?? "", ...zinnen(bron.fd ?? ""), ...(meer?.perBron?.find((b) => sleutel(b.site) === sleutel(bron.site))?.punten ?? [])].map(schoon);
  const labels = (tekst: string) => bronnen.filter((bron) => eigenTeksten(bron).some((eigen) => dekt(tekst, eigen)));
  const punten: (BronnenPunt & { volgorde: number })[] = groepen.map((groep) => {
    const varianten = groep.kandidaten.map((k) => ({ ...k, labels: labels(k.tekst) }));
    varianten.sort((a, b) => b.labels.length - a.labels.length || a.tekst.length - b.tekst.length || a.volgorde - b.volgorde);
    return { tekst: varianten[0].tekst, bronnen: varianten[0].labels, volgorde: groep.volgorde };
  });
  for (const bron of bronnen) {
    if (punten.some((p) => p.bronnen.includes(bron))) continue;
    const eigen = kandidaten.filter((k) => k.bron === bron).sort((a, b) => a.tekst.length - b.tekst.length)[0];
    if (eigen) punten.push({ tekst: eigen.tekst, bronnen: [bron], volgorde: eigen.volgorde });
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
