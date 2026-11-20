import { parsePad } from "./artikelid";
import { ams } from "./tijd";

type Venster = { location: { pathname: string; search: string }; history: { replaceState(s: unknown, t: string, u: string): void; pushState(s: unknown, t: string, u: string): void } };

// Gedeelde link /bericht/<dag>/<id>-<slug> (serverpagina): open dezelfde artikelweergave als in de app, met de home erachter
// (sluiten of terugvegen gaat dan naar het overzicht). De query blijft letterlijk behouden (o.a. ?nietmeten=1 voor startAnalytics).
export function openGedeeld(w: Venster): boolean {
  const gedeeld = parsePad(w.location.pathname);
  if (!gedeeld) return false;
  const q = w.location.search;
  w.history.replaceState(null, "", `/${q}#/`);
  w.history.pushState({ binnen: true, gedeeld: { dag: gedeeld.dag, id: gedeeld.id } }, "", `/${q}#/bericht/${encodeURIComponent(gedeeld.id)}`);
  return true;
}

// Een gedeelde identiteit is alleen geldig bij data van dezelfde Amsterdamse dag.
export function gedeeldeDagBeschikbaar(dag: string | undefined, gegenereerd: string | undefined): boolean {
  if (!dag) return true;
  const tijd = Date.parse(gegenereerd || "");
  return Number.isFinite(tijd) && ams(tijd).iso === dag;
}
