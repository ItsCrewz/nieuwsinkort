// Nederland of Buitenland? Pure module (geen DOM), gedeeld door worker en frontend (net als bronlink.ts).
// De feedgroep "nl" bevat ook buitenlandfeeds (NOS/NU.nl Buitenland) en algemene feeds; de AI classificeert niet.
// Regels (volgorde telt):
// 1. Per bron een signaal: buitenlandfeed of heel padsegment buitenland/world/... = "buiten"; binnenland/regio/politiek = "binnen";
//    sport/entertainment/... = "neutraal" (zegt niets over land); verder geen signaal.
// 2. Een duidelijk Nederlands anker in kop of ai (NL_ANKER) houdt het bij Nederland.
//    De feedomschrijving (#476) telt alleen mee als kop, ai én omschrijving zelf geen NL-anker hebben, en dan alleen via BUITEN_LOCATIE.
// 3. Meer buiten- dan binnensignalen = Buitenland. Zonder buiten/binnen en zonder neutraal signaal beslissen landnamen (BUITEN_WOORD).
// Alleen cat "nl" wordt ooit herindeeld; andere rubrieken blijven ongemoeid.
// Eindgrens via lookahead: \b ziet ë (België, Servië) niet als woordteken. Geen NAVO: dat kan ook Nederlands zijn.
export const BUITEN_WOORD =/\b(VS|V\.S\.|Amerika\w*|Trump|Biden|China|Chin\w+|Rusland|Russ\w+|Poetin|Oekraïn\w*|Zelensky|Israël\w*|Gaza|Iran\w*|Spanje|Spaans\w*|Brazili\w+|Bolsonaro|Lula|Duitsland|Duits\w*|Frankrijk|Frans\w*|Engeland|Brit\w+|Londen|Italië|Itali\w+|Meloni|België|Belgisch\w*|Japan\w*|India\w*|Canad\w+|Mexico|Turk\w+|Syri\w+|Libanon|Alaska|Cuba|Venezuela|Soedan|Finland|Zweden|Zweeds\w*|Polen|Pools\w*|Bahama's|Washington|New York|Verenigde Staten|Florida|Californi(?:ë|e)|Texas|Louisiana|Alabama|Arizona|Nevada|Ohio|Oklahoma|Minnesota|Michigan|Tennessee|Hawaii|Los Angeles|Miami|Moskou|Kiev|Kyiv|Peking|Tokio|Teheran|Jeruzalem|Beiroet|Bagdad|Kaboel|Congres|Senaat|Netanyahu|Likoed|Australi\w+|Noord-Korea|Kim Jong-un|Servi(?:ë|sch\w*|ër\w*)|Egypt\w*|Pakista\w+|Azi(?:ë|atisch\w*)|Republikein\w*|Democraten|Kremlin|Hamas|Hezbollah|Houthi\w*)(?![\p{L}\d])/u;
// Alleen sterke plaatsaanduidingen, voor de feedomschrijving (#476): daar is een landnaam vaak terloops ("exporteert naar Duitsland"),
// een Amerikaanse staat of de Verenigde Staten niet. Alleen VS, geen andere landen, wereldsteden of bijvoeglijke naamwoorden ("Amerikaanse investeerder").
export const BUITEN_LOCATIE =/\b(Verenigde Staten|Amerikaanse staat|Florida|Californi(?:ë|e)|Texas|Louisiana|Alabama|Arizona|Nevada|Ohio|Oklahoma|Minnesota|Michigan|Tennessee|Hawaii|Los Angeles|Chicago|Miami|Las Vegas|New York)(?![\p{L}\d])/u;
// Hoofdlettergevoelig: eigennamen; "NS" alleen als los woord.
export const NL_ANKER = /\b(Nederland\w*|Nederlander\w*|Nederlandse?|kabinet|Tweede Kamer|Eerste Kamer|Den Haag|Haagse|Amsterdam\w*|Rotterdam\w*|Utrecht\w*|Eindhoven|Groningen|Haarlem|Jetten|KNMI|ProRail|Rijkswaterstaat|Wekdienst|Schiphol|NS)\b/;

// Buitenlandse bedrijven en markten zijn alleen bij economisch nieuws een regio-aanwijzing.
const BUITEN_ECONOMIE = /\b(Binance|Wall Street|Nasdaq|Dow Jones|S&P 500)\b/;
const ECONOMIE = /\b(beurs\w*|aandelen\w*|koers\w*|markt\w*|crypto\w*|bitcoin\w*|handelsplatform\w*|winst\w*|verlies\w*|boete\w*|failliet\w*|handel\w*|investeer\w*|belegger\w*)\b/i;

type BronIn = { href: string; buitenFeed?: boolean };
export type Signaal = "buiten" | "binnen" | "neutraal" | null;

const BUITEN_SECTIE = new Set(["buitenland", "world", "wereld", "internationaal", "international", "verkiezingen-vs", "spanningen-oekraine", "oorlog-in-oekraine", "midden-oosten"]);
const BINNEN_SECTIE = new Set(["binnenland", "regio", "politiek"]);
const NEUTRAAL_SECTIE = new Set(["sport", "voetbal", "formule-1", "autosport", "schaatsen", "tennis", "wielrennen", "boulevard", "entertainment", "sterren", "lifestyle", "vrouw", "puzzels", "het-woord"]);

export function bronSignaal(b: BronIn): Signaal {
  if (b.buitenFeed) return "buiten";
  let pad: string[];
  try { pad = new URL(b.href).pathname.toLowerCase().split("/").filter(Boolean); } catch { return null; }
  // Hele padsegmenten, geen substring: "/nederland-groeit-door-buitenlandse-migratie" zegt niets.
  const heeft = (lijst: Set<string>) => pad.some((s) => lijst.has(s));
  if (heeft(BUITEN_SECTIE)) return "buiten";
  if (heeft(BINNEN_SECTIE)) return "binnen";
  if (heeft(NEUTRAAL_SECTIE)) return "neutraal";
  return null;
}

export function isBuitenland(it: { kop?: string; ai?: string; omschrijving?: string; bronnen?: BronIn[] }): boolean {
  const tekst = `${it.kop || ""} ${it.ai || ""}`;
  if (NL_ANKER.test(tekst)) return false;
  const oms = it.omschrijving || "";
  const omsBuiten = !!oms && !NL_ANKER.test(oms) && BUITEN_LOCATIE.test(oms);
  const s = (it.bronnen || []).map(bronSignaal);
  const b = s.filter((x) => x === "buiten").length, n = s.filter((x) => x === "binnen").length;
  if (b > n) return true;
  if (b + n === 0 && !s.includes("neutraal")) return BUITEN_WOORD.test(tekst) || omsBuiten || (BUITEN_ECONOMIE.test(tekst) && ECONOMIE.test(tekst));
  return false;
}

export function herindeel<T extends { cat: string; kop?: string; ai?: string; omschrijving?: string; bronnen?: BronIn[] }>(it: T): T {
  return it.cat === "nl" && isBuitenland(it) ? { ...it, cat: "buitenland" } : it;
}
