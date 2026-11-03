import type { Bron, Item, Meer } from "./types";

export type BronnenPunt = { tekst: string; bronnen: Bron[] };
const schoon = (s: string) => s.replace(/[\u200b-\u200f\u2060\ufeff\ufffd]/g, "").replace(/\s+/g, " ").trim();
const zonderBron = (s: string) => s.replace(/^[^|]{1,40}\|\s*/, "").replace(/\s+(?:[-–—|]\s*[^|]+|\([^()]+\))\s*$/, "");
const normaliseer = (s: string) => zonderBron(schoon(s)).normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
export const zelfdeZin = (a: string, b: string) => {
  if (a.trim().endsWith("?") !== b.trim().endsWith("?")) return false;
  const tekst = normaliseer(a);
  return tekst.length > 0 && tekst === normaliseer(b);
};
const sleutel = (s: string) => s.trim().toLowerCase();
const zinnen = (s: string) => s.match(/[^.!?]+[.!?]+(?=\s|$)/g) ?? [];

/** Combineert beschikbare artikelpunten en volledige feedzinnen per uitgever. */
export function bronnenPunten(item: Item, meer: Meer | null): BronnenPunt[] {
  const bronnen = (item.bronnen ?? []).filter((b, i, alle) => alle.findIndex((x) => sleutel(x.site) === sleutel(b.site)) === i);
  if (bronnen.length < 2 && !meer?.perBron?.length) return [];
  const eigenTeksten = (bron: Bron) => [bron.ft?.replace(/^[^|]{1,40}\|\s*/, "") ?? "", ...zinnen(bron.fd ?? ""), ...(meer?.perBron?.find((b) => sleutel(b.site) === sleutel(bron.site))?.punten ?? [])].map(schoon);
  const punten: BronnenPunt[] = [];
  for (const bron of bronnen) {
    const ai = meer?.perBron?.find((b) => sleutel(b.site) === sleutel(bron.site));
    const bruikbaar = (tekst: string) => tekst.length >= 25 && !/^(?:volg\b.*\b(?:ons|het) liveblog\b|lees meer\b)/i.test(tekst) && /[\p{L}\p{N}]/u.test(tekst);
    const teksten = [...(ai?.punten ?? []), ...zinnen(bron.fd ?? "")].map(schoon).filter(bruikbaar);
    const titel = schoon(bron.ft ?? "").replace(/^[^|]{1,40}\|\s*/, "");
    if (!teksten.length && bruikbaar(titel)) teksten.push(titel);
    for (const tekst of teksten) if (!punten.some((p) => zelfdeZin(p.tekst, tekst))) punten.push({ tekst, bronnen: [] });
  }
  for (const punt of punten) punt.bronnen = bronnen.filter((bron) => eigenTeksten(bron).some((tekst) => zelfdeZin(punt.tekst, tekst)));
  const boven = [item.kop, ...zinnen(item.samenvatting ?? ""), ...zinnen(item.ai ?? "")];
  const aantallen = new Map(bronnen.map((bron) => [bron, punten.filter((p) => p.bronnen.includes(bron)).length]));
  return punten.filter((p) => {
    if (p.bronnen.length > 1 || !boven.some((tekst) => zelfdeZin(p.tekst, tekst)) || p.bronnen.some((bron) => aantallen.get(bron)! <= 1)) return true;
    for (const bron of p.bronnen) aantallen.set(bron, aantallen.get(bron)! - 1);
    return false;
  }).sort((a, b) => b.bronnen.length - a.bronnen.length).map(({ tekst, bronnen: bs }) => ({ tekst, bronnen: bs.map(({ site, href }) => ({ site, href })) }));
}
