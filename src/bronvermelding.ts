// De bron (de nieuwssite die het bericht schreef) is nooit verkoper, aanbieder of kanaal (#488): "…beschikbaar via iCulture." haalt dit weg.
// Pure, deterministische nacontrole zonder AI; gebruikt bij het maken van een nieuwe samenvatting (Worker) en bij weergave (client, bestaande items).
// Alleen vermeldingen aan het zinseinde ("via X", "volgens X", "aldus X", "bron: X") worden verwijderd en "via X" ook midden in een zin;
// een zin die met "Volgens X" begint is gewone toeschrijving en blijft staan.
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Schrijfwijzen van een bronnaam: "de Volkskrant" ook als "Volkskrant", "NU.nl" ook als "NU", "Tweakers.net" ook als "Tweakers". */
export function naamVarianten(site: string): string[] {
  const s = (site || "").trim();
  const v = new Set([s, s.replace(/^(de|het)\s+/i, ""), s.replace(/\.(nl|net|com|org|be)$/i, ""), s.replace(/^(de|het)\s+/i, "").replace(/\.(nl|net|com|org|be)$/i, "")]);
  return [...v].filter((x) => x.length >= 2).sort((a, b) => b.length - a.length);
}

function patroon(sites: string[], woorden: string): RegExp | null {
  const alt = sites.flatMap(naamVarianten).map(esc).join("|");
  return alt ? new RegExp(`(?:\\s*,)?\\s+(?:${woorden})\\s+(?:${alt})(?![\\p{L}\\p{N}])`, "giu") : null;
}

/** Haalt "via/volgens/aldus/bron: <bronnaam>" aan het eind van een zin weg en "via <bronnaam>" ook midden in een zin. */
export function stripBronvermelding(tekst: string, sites: string[]): string {
  if (!tekst || !sites.length) return tekst;
  const eind = patroon(sites, "via|volgens|aldus|bron:");
  const via = patroon(sites, "via");
  if (!eind || !via) return tekst;
  return tekst
    .replace(new RegExp(eind.source + "(?=\\s*(?:[.!?…]|$))", "giu"), "")
    .replace(via, "")
    .replace(/\s+([.!?,])/g, "$1");
}

/** Of een tekst nog een bronvermelding als kanaal bevat (voor tests en meting). */
export const heeftBronvermelding = (tekst: string, sites: string[]) => stripBronvermelding(tekst, sites) !== tekst;
