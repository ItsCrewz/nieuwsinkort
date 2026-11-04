// Deel algemeen nieuws conservatief in op basis van bronpad en titel.
type Cat = "f1" | "voetbal" | "auto" | "sport";
// Feedbeschrijving: alleen sterke, eenduidige voetbalsignalen (geen clubnamen, Oranje of losse woorden; "oud-voetballer" niet).
const VOETBAL_BESCHRIJVING = /(?<!oud-)\b(?!oud-)(?:[a-z]+-?)?voetbal(?:l?ers?|sters?|clubs?|bond|trainers?|podcasts?)(?![a-z])|\b(?:eredivisie|champions league|europa league|knvb)\b/i;
// Overige sport (#435): eenduidige sportwoorden en sportnamen. "Schaatsen" is alleen sport zonder weer-/natuurijscontext (Thialf en wedstrijdwoorden wegen zwaarder); kale "dart" (NASA) telt niet.
const SPORT_WOORD = /\b(?:darts\w*|darters?|dartsters?|wielrenn(?:ers?|sters?|en)|wielerploeg|wielrennen|tour de france|giro d'italia|vuelta|parijs-roubaix|ronde van (?:vlaanderen|frankrijk|italië|spanje)|tennis(?:sers?|sters?|toernooi)?|wimbledon|roland garros|australian open|hockey(?:ers?|sters?)?|basketbal(?:ler|ster)?|volleybal(?:ler|ster)?|handbal(?:ler|ster)?|atletiek|judoka'?s?|roeiers?|rugby|nba|nfl|olympische (?:winter)?spelen|paralympische spelen|thialf|pdc|world matchplay)\b/i;
const SCHAATS_WOORD = /\b(?:schaatsen|schaatsers?|schaatsster|schaatsploeg|schaatstoernooi|wereldbeker schaatsen|thialf)\b/i;
const SPORT_NAAM = /\b(?:pogačar|pogacar|vingegaard|evenepoel|van der poel|van aert|kjeld nuis|jutta leerdam|femke kok|fallon sherrock|luke littler|michael van gerwen|gian van veen)\b/i;
const WEER_ZONDER_SPORT = /\b(?:natuurijs|ijsdikte|dooi|vorst|ijsvrij|ijsmeester|weerbericht|weersverwachting|weeronline|weerplaza|knmi|wak|ijsclub|elfstedentocht|code (?:geel|oranje|rood))\b/i;
const SPORT_WEDSTRIJD = /\b(?:thialf|wk|ek|nk|wereldbeker|kampioenschap|medaille)\b/i;
// Dubbelzinnige woorden (zwemmers gered, Tina Turner) tellen alleen met wedstrijdcontext; afstanden alleen met een uitslagwoord.
const SPORT_VAGE = /\b(?:zwemm(?:ers?|sters?)|turn(?:er|ster)s?)\b/i;
const SPORT_CONTEXT = /\b(?:wint|wk|ek|nk|olympisch\w*|medaille|record|finale|toernooi)\b/i;
const SPORT_AFSTAND = /\b(?:500|1\.?000|1\.?500|3\.?000|5\.?000|10\.?000)\s?(?:meter|m)\b/i;
const SPORT_UITSLAG = /\b(?:wint|winst|zege|rit|race|brons|zilver|goud|record|wereldrecord)\b/i;
// Buitenlandse voetbalclubs/competities (#435): sterke namen altijd; losse (Chelsea, Inter) alleen met sportpad of uitslag. Steden (Barcelona, Madrid) blijven geen voetbal.
const CLUB_STERK = /\b(?:real madrid|atl[ée]tico madrid|manchester (?:united|city)|premier league|la liga|bundesliga|serie a|stamford bridge|bayern m[üu]nchen|borussia dortmund|paris saint-germain|fc barcelona)\b/i;
const CLUB_LOS = /\b(?:chelsea|inter|liverpool|arsenal|tottenham|juventus|psg|levante|barcelona|ac milan|dortmund|bayern|atl[ée]tico)\b/i;
function sportWoord(tekst: string): boolean {
  if (SPORT_WOORD.test(tekst) || SPORT_NAAM.test(tekst)) return true;
  if (SPORT_VAGE.test(tekst) && SPORT_CONTEXT.test(tekst)) return true;
  if (SPORT_AFSTAND.test(tekst) && SPORT_UITSLAG.test(tekst)) return true;
  return SCHAATS_WOORD.test(tekst) && (!WEER_ZONDER_SPORT.test(tekst) || SPORT_WEDSTRIJD.test(tekst));
}
export function sportCat({ cat, kop, hrefs, besch = "" }: { cat: string; kop: string; hrefs: string[]; besch?: string }): Cat | null {
  // Autobronnen publiceren ook F1/voetbal: die cat mag omhoog (F1 > voetbal > auto).
  if (!["nl", "buitenland", "tech", "auto", "sport"].includes(cat)) return null;
  const paden = hrefs.map((href) => { try { return new URL(href).pathname.toLowerCase(); } catch { return ""; } });
  const pad = (re: RegExp) => paden.some((p) => re.test(p));
  const f1 = /\b(?:formule\s*1|f1|grand prix|gp|verstappen|lando norris|oscar piastri|charles leclerc|lewis hamilton|george russell|fernando alonso|carlos sainz|kimi antonelli|isack hadjar|red bull racing|pole position|poleposition|pitstop)\b/i.test(kop);
  const club = /\b(?:ajax|psv|feyenoord|az|fc twente)\b/i.test(kop);
  // Samenstellingen (amateurvoetballer, voetbalclub) tellen; "oud-voetballer" niet, want die komt ook in showbizz voor. Losse woorden als club, wedstrijd, race of finale zijn geen signaal.
  const sportpad = pad(/\/(?:nieuws\/)?sport(?:\/|$)/);
  const voetbalWoord = /(?<!oud-)\b(?!oud-)(?:[a-z]+-?)?voetbal(?:l?ers?|sters?|clubs?|bond|stadion|wedstrijd|fans?|supporters?|trainer|competitie|seizoen|podcasts?)?(?![a-z])/i.test(kop);
  const voetbal = club || VOETBAL_BESCHRIJVING.test(besch) || voetbalWoord || (sportpad && /\b(?:spits|doelman|aanvaller|middenvelder|scheidsrechter|bondscoach)\b/i.test(kop)) || CLUB_STERK.test(kop) || (CLUB_LOS.test(kop) && (sportpad || /\b\d{1,2}-\d{1,2}\b/.test(kop))) || /\b(?:eredivisie|champions league|europa league|knvb|doelpunt)\b/i.test(kop) || (/\boranje\b/i.test(kop) && /\b(?:voetbal|bondscoach|koeman|wk|ek)\b/i.test(kop));
  if (pad(/(?:\/formule-?1(?:\/|$)|\/formula1(?:\/|$)|\/f1(?:\/|$)|nossportformule1)/) || f1) return "f1";
  if (pad(/\/(?:voetbal|eredivisie|champions-league|football|soccer)(?:\/|$)/) || voetbal) return "voetbal";
  // Motorsport zonder F1 (MotoGP, motorcoureurs) hoort bij Auto.
  if (pad(/\/sport\/(?:motogp|autosport)(?:[\/-]|$)/) || /\b(?:motogp|motorcoureurs?|superbike)\b/i.test(kop) || (sportpad && /\b(?:coureurs?)\b/i.test(kop))) return "auto";
  // Overige sport: sportpad (/sport/, /darts/, /wielrennen/ ...) of eenduidig sportwoord in titel/beschrijving; voetbal, F1 en auto gingen al voor.
  if (cat !== "auto" && (sportpad || pad(/\/(?:darts|schaatsen|wielrennen|wielersport|tennis|hockey|basketbal|volleybal|handbal|zwemmen|atletiek|judo|rugby|olympische-spelen)(?:\/|$)/) || sportWoord(kop) || sportWoord(besch))) return "sport";
  if (/\b(?:ongeluk|crash|botsing|kop|gewond|politie|brand|a2|snelweg|brandstofprijzen?)\b/i.test(kop)) return null;
  if (pad(/\/(?:auto|autovisie)(?:\/|$)/)) return "auto";
  const woorden = kop.match(/\b(?:automerk|autofabrikant|auto(?:'s)?|ev|rijtest|tesla|volkswagen|bmw|toyota|kia|hyundai|renault|peugeot|volvo|byd|laadpaal|apk)\b/gi) || [];
  return woorden.length >= 2 ? "auto" : null;
}
export function herindeelSport(k: { cat: string; c: { t: string; href: string; s?: string }[] }): void {
  // Alle titels en bronpaden tellen mee, ook als de oudste bron een algemene feed is.
  k.cat = sportCat({ cat: k.cat, kop: k.c.map((c) => c.t).join(" "), hrefs: k.c.map((c) => c.href), besch: k.c.map((c) => c.s || "").join(" ") }) || k.cat;
}
// Item uit een eerdere run of na de AI-stap: oorspronkelijke feedtitels (bronnen[].ft) en een ingekorte beschrijving (bronnen[].fd, alleen sterke voetbalsignalen) tellen mee naast de AI-kop, zodat herformulering de rubriek niet verandert.
export function sportCatItem(i: { cat: string; kop?: string; bronnen?: { href?: string; ft?: string; fd?: string }[] }): Cat | null {
  const b = i.bronnen || [];
  return sportCat({ cat: i.cat, kop: [i.kop || "", ...b.map((x) => x.ft || "")].join(" "), hrefs: b.map((x) => x.href || ""), besch: b.map((x) => x.fd || "").join(" ") });
}
