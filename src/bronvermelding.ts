// Verwijder een bronnaam alleen als die in een verkoopcontext als kanaal wordt genoemd (#488).
// De Worker en client gebruiken dezelfde conservatieve controle.
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Schrijfwijzen van een bronnaam, inclusief varianten zonder lidwoord of domein. */
export function naamVarianten(site: string): string[] {
  const s = (site || "").trim();
  const v = new Set([s, s.replace(/^(de|het)\s+/i, ""), s.replace(/\.(nl|net|com|org|be)$/i, ""), s.replace(/^(de|het)\s+/i, "").replace(/\.(nl|net|com|org|be)$/i, "")]);
  return [...v].filter((x) => x.length >= 2).sort((a, b) => b.length - a.length);
}

/** Haalt uitsluitend een verkoopvermelding via een bron van dit item weg. */
export function stripBronvermelding(tekst: string, sites: string[]): string {
  const namen = [...new Set(sites.flatMap(naamVarianten))].sort((a, b) => b.length - a.length);
  if (!tekst || !namen.length) return tekst;
  const via = new RegExp(`\\s+via\\s+(?:${namen.map(esc).join("|")})(?![\\p{L}\\p{N}\\p{M}\u2010\u2011\u2013\u2014-]|\\.[\\p{L}\\p{N}])`, "giu");
  return tekst.replace(via, (match, offset: number) => {
    const vooraf = tekst.slice(0, offset).split(/[.!?…;\n]/u).pop() || "";
    const zin = vooraf + tekst.slice(offset).split(/[!?…;\n]|\.(?![\p{L}\p{N}])/u)[0];
    if (/\b(?:kijken|luisteren|uitzending\w*|livestream\w*|aflevering\w*|programma(?:'s|’s|s)?|wedstrijd\w*|live|volgen|te zien|te horen)\b/iu.test(zin)) return match;
    return /\b(?:te koop|verkrijgbaar|te bestellen|verkocht|kopen|in de winkel|prijs)\b/iu.test(vooraf) || /\bkomt\s+(?:er\s+)?[^.!?…;\n]*\bbeschikbaar\s*$/iu.test(vooraf) ? "" : match;
  });
}

export const heeftBronvermelding = (tekst: string, sites: string[]) => stripBronvermelding(tekst, sites) !== tekst;
