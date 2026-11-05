// Geldigheid van de gecachte overzichten (/vandaag, /sitemap-nieuws.xml): nooit voorbij een Amsterdamse grens,
// want na middernacht verandert het dagfilter en na 06:00 op dag D+1 sturen de berichtlinks van dag D door naar home.
import { ams, midnight } from "./tijd";

export const OVERZICHT_TTL = 300;
const UUR = 3600e3;
/** Eerste moment ná `nu` waarop de overzichtsinhoud verloopt (ms). `gegenereerd` = tijd van de dataset (ISO). */
export function volgendeGrens(nu: number, gegenereerd?: string): number {
  const gen = Date.parse(gegenereerd || "");
  const grenzen = [midnight(midnight(nu) + 36 * UUR)]; // eerstvolgende middernacht (DST-dagen duren 23 of 25 uur)
  if (Number.isFinite(gen)) {
    const begin = midnight(midnight(gen) + 36 * UUR); // begin van dag D+1
    const zes = [5, 6, 7].map((u) => begin + u * UUR).find((t) => { const a = ams(t); return a.h === 6 && a.min === 0; });
    if (zes != null) grenzen.push(zes);
  }
  return Math.min(...grenzen.filter((g) => g > nu));
}
/** Levensduur in hele seconden: maximaal 5 minuten, en nooit voorbij de volgende grens. */
export function overzichtTtl(nu: number, gegenereerd?: string): number {
  return Math.max(1, Math.min(OVERZICHT_TTL, Math.floor((volgendeGrens(nu, gegenereerd) - nu) / 1000)));
}
/** Eigen verlooptijd in de cache-entry, zodat ook een cache zonder eigen expiry (of een mock) geen oud antwoord geeft. */
export const GELDIG_TOT = "X-Geldig-Tot";
export const nogGeldig = (r: Response, nu: number) => nu < Number(r.headers.get(GELDIG_TOT));
