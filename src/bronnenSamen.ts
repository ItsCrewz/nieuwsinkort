import type { Bron, Item, Meer } from "./types";

export type BronnenPunt = { tekst: string; bronnen: Bron[] };
const schoon = (s: string) => s.replace(/[\u200b-\u200f\u2060\ufeff\ufffd]/g, "").replace(/\s+/g, " ").trim();
const bekendeBronnen = ["ANP", "NOS", "NU.nl", "RTL Nieuws", "Telegraaf", "AD", "Volkskrant", "Trouw", "NRC", "Parool", "Omroep Brabant", "L1", "BN DeStem", "De Gelderlander", "Algemeen Dagblad", "Het Parool", "De Volkskrant", "Nederlands Dagblad", "Reformatorisch Dagblad", "NH Nieuws", "RTV Utrecht", "Omroep Gelderland", "Omroep West", "Omroep Zeeland", "RTV Noord", "RTV Drenthe", "Omrop Fryslân", "NOS Nieuws"];
const bronSleutel = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
const zonderBron = (s: string, namen: string[]) => {
  const bekend = (naam: string) => namen.some((n) => bronSleutel(n) === bronSleutel(naam));
  return s.replace(/^([^|]{1,80})\|\s*/, (geheel, naam: string) => bekend(naam) ? "" : geheel)
    .replace(/\s+(?:[-–—|]\s*([^|]+)|\(([^()]+)\))\s*$/, (geheel, naam: string, tussen: string) => bekend(naam ?? tussen) ? "" : geheel);
};
// Tekens die betekenis dragen blijven staan: valuta, procent, een teken vóór een getal, scheiders binnen getallen
// en elk vraagteken als eigen token (een vraag midden in de zin is nooit gelijk aan een stelling).
const normaliseer = (s: string, namen: string[]) => zonderBron(schoon(s), namen).normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[−–](?=\d)/g, "-")
  .replace(/[^\p{L}\p{N}\s€$£%+\-.,?]|[+-](?!\d)|(?<!\d)[.,]|[.,](?!\d)/gu, " ").replace(/\?/g, " ? ").replace(/\s+/g, " ").trim();
// Een vraag (ook met bronsuffix of afsluitend aanhalingsteken) is nooit bewijs voor een stelling.
const isVraag = (s: string, namen: string[]) => /\?["'”’»)\s]*$/.test(zonderBron(schoon(s), namen));
export const zelfdeZin = (a: string, b: string, extraBronnen: string[] = []) => {
  const namen = [...bekendeBronnen, ...extraBronnen];
  if (isVraag(a, namen) !== isVraag(b, namen)) return false;
  const tekst = normaliseer(a, namen);
  return tekst.length > 0 && tekst === normaliseer(b, namen);
};
const sleutel = (s: string) => s.trim().toLowerCase();
// Alleen echte zinsgrenzen: leesteken + spatie + hoofdletter, niet na afkortingen of initialen; zinnen zonder slotteken vallen af.
const afkorting = /(?:\b(?:\p{L}\.){2,}|\b\p{Lu}\.|\b(?:bijv|dhr|mevr|mr|dr|drs|ir|ing|prof|ca|nr|jl|st|vs|zgn)\.)$/iu;
const zinnen = (s: string) => s.split(/(?<=[.!?]["'”’»)]*)\s+(?=["'“‘«(]?\p{Lu})/u)
  .reduce<string[]>((alle, deel) => (alle.length && afkorting.test(alle[alle.length - 1]) ? alle[alle.length - 1] += " " + deel : alle.push(deel), alle), [])
  .map((z) => z.trim()).filter((z) => /[.!?]["'”’»)]*$/.test(z));

/** Combineert beschikbare artikelpunten en volledige feedzinnen per uitgever. */
export function bronnenPunten(item: Item, meer: Meer | null): BronnenPunt[] {
  const bronnen = (item.bronnen ?? []).filter((b, i, alle) => alle.findIndex((x) => sleutel(x.site) === sleutel(b.site)) === i);
  if (bronnen.length < 2 && !meer?.perBron?.length) return [];
  const namen = bronnen.map((b) => b.site);
  const gelijk = (a: string, b: string) => zelfdeZin(a, b, namen);
  const eigenTeksten = (bron: Bron) => [bron.ft ?? "", ...zinnen(bron.fd ?? ""), ...(meer?.perBron?.find((b) => sleutel(b.site) === sleutel(bron.site))?.punten ?? [])].map(schoon);
  const punten: BronnenPunt[] = [];
  for (const bron of bronnen) {
    const ai = meer?.perBron?.find((b) => sleutel(b.site) === sleutel(bron.site));
    const bruikbaar = (tekst: string) => tekst.length >= 20 && !/^(?:volg\b.*\b(?:ons|het) liveblog\b|lees meer\b)/i.test(tekst) && /[\p{L}\p{N}]/u.test(tekst);
    const teksten = [...(ai?.punten ?? []), ...zinnen(bron.fd ?? "")].map(schoon).filter(bruikbaar);
    const titel = zonderBron(schoon(bron.ft ?? ""), [...bekendeBronnen, ...namen]);
    if (!teksten.length && bruikbaar(titel)) teksten.push(titel);
    // Laatste terugval: ook een korte titel, zodat elke bron zichtbaar blijft.
    if (!teksten.length && /[\p{L}\p{N}]/u.test(titel)) teksten.push(titel);
    for (const tekst of teksten) if (!punten.some((p) => gelijk(p.tekst, tekst))) punten.push({ tekst, bronnen: [] });
  }
  for (const punt of punten) punt.bronnen = bronnen.filter((bron) => eigenTeksten(bron).some((tekst) => gelijk(punt.tekst, tekst)));
  const boven = [item.kop, ...zinnen(item.samenvatting ?? ""), ...zinnen(item.ai ?? "")];
  const aantallen = new Map(bronnen.map((bron) => [bron, punten.filter((p) => p.bronnen.includes(bron)).length]));
  return punten.filter((p) => {
    if (p.bronnen.length > 1 || !boven.some((tekst) => gelijk(p.tekst, tekst)) || p.bronnen.some((bron) => aantallen.get(bron)! <= 1)) return true;
    for (const bron of p.bronnen) aantallen.set(bron, aantallen.get(bron)! - 1);
    return false;
  }).sort((a, b) => b.bronnen.length - a.bronnen.length).map(({ tekst, bronnen: bs }) => ({ tekst, bronnen: bs.map(({ site, href }) => ({ site, href })) }));
}
