// Clusteren van nieuwskandidaten uit feeds: pure module (geen Worker-API's), getest in tests/cluster.test.ts.
// Conservatief: liever twee losse berichten dan twee verschillende verhalen samen.

export const STOP = new Set(("de het een en van in op te voor met is zijn er dat die bij uit aan om ook als naar over na door nog niet wel maar dan was wordt worden heeft hebben meer dit deze tot kan nu zo al wat hoe waar wie ze hij zij we je jij u the a an of to in on for with and is are was be at by from as it its this that after over new says will has have can how why what who "
  // hulpwerkwoorden: zeggen niets over het verhaal ("Kamer wil ..." / "Kamer wilt ...")
  + "wil wilt willen wilde wou gaat gaan ging moet moeten mag mogen zal zullen zou zouden kunnen kon komt krijgt krijgen").split(" "));

// Duidelijke gevallen van dezelfde zaak in andere woorden (na ontdoen van accenten, kleine letters).
const SYN: Record<string, string> = {
  verbieden: "verbod", verbiedt: "verbod", verbood: "verbod", verboden: "verbod", verbod: "verbod", verbiedend: "verbod",
  basisschool: "basisschool", basisscholen: "basisschool", basisonderwijs: "basisschool", basisschoolleerlingen: "basisschool",
  scholen: "school", scholieren: "scholier", leerlingen: "leerling",
};

/** eenvoudige stam: meervoud -en/-s, met een kleine tabel voor onregelmatige of samengestelde woorden */
export function stam(w: string): string {
  if (SYN[w]) return SYN[w];
  if (w.length >= 6 && w.endsWith("en")) w = w.slice(0, -2);
  else if (w.length >= 5 && w.endsWith("s") && !/(ss|us|is|as|os)$/.test(w)) w = w.slice(0, -1);
  return w.length >= 6 && w.endsWith("e") ? w.slice(0, -1) : w;
}

// Woorden die in veel verschillende verhalen voorkomen: tellen mee, maar twee berichten moeten ook minstens twee andere woorden delen.
const ALGEMEEN = new Set("tweede kamer kabinet minister motie meerderheid nederland nederlands nederlandse haarlem gemeente onderzoek nieuw nieuwe politie bericht security operation webinar product energy series software update ingekomen aanvraag omgevingsvergunning ontvangen officiele bekendmakingen".split(" ").map(stam));
// acroniemen (2 letters) en korte getallen (jaartal, postcodedeel) tellen hier niet mee
const eigen = (a: Set<string>, b: Set<string>) => { let n = 0; for (const x of a) if (x.length > 2 && b.has(x) && !ALGEMEEN.has(x) && !/^\d{1,4}$/.test(x)) n++; return n; };

/** hoofdletter-acroniemen van 2 letters in de oorspronkelijke tekst (AI, EU, VS, VN, KI, OM); niet in een tekst helemaal in kapitalen */
function acroniemen(s: string): string[] {
  if (!/[a-z]/.test(s)) return [];
  return (s.match(/(?<![A-Za-z])[A-Z]{2}(?![A-Za-z])/g) || []).map((a) => a.toLowerCase()).filter((a) => !STOP.has(a));
}

export const toks = (s: string) => {
  const out = new Set<string>();
  for (const a of acroniemen(s)) out.add(a);
  for (const w of s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/)) {
    if (w.length > 2 && !STOP.has(w)) out.add(stam(w));
  }
  return out;
};
export function sim(a: Set<string>, b: Set<string>) { let n = 0; for (const x of a) if (b.has(x)) n++; return { n, j: n / (a.size + b.size - n || 1) }; }
export const normLink = (l: string) => l.replace(/^https?:\/\/(www\.)?/, "").replace(/[?#].*$/, "").replace(/\/$/, "").toLowerCase();

export type Cand = { cat: string; site: string; href: string; t: string; s: string; d: number; img?: string };
/** tok/tokS: titeltokens resp. titel + begin van de beschrijving (alleen extra bewijs); nmT/nm: eigennamen (hoofdletter midden in de zin) in de titel resp. titel + beschrijving */
export type Lid = { tok: Set<string>; tokS: Set<string>; nmT?: Set<string>; nm?: Set<string>; site?: string };
/** tok/tokS hier zijn de unie van de leden (voor covered() in index.ts); vergelijken gebeurt per lid in `leden` */
export type Cluster = { key: string; cat: string; c: Cand[]; tok: Set<string>; tokS: Set<string>; leden: Lid[] };

const norm = (w: string) => stam(w.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, ""));
/** eigennamen: woorden van ≥4 letters met hoofdletter die niet aan het begin van een zin staan ("Wolf Bram opgezet in Naturalis" → bram, naturalis); niet in een tekst helemaal in kapitalen */
export function namen(s: string): Set<string> {
  const out = new Set<string>();
  if (!/[a-z]/.test(s)) return out;
  for (const m of s.matchAll(/(?<![\p{L}\p{N}])\p{Lu}[\p{L}]{3,}(?![\p{L}])/gu)) {
    const voor = s.slice(0, m.index).replace(/\s+$/, "");
    if (!voor || /[.!?:"'“”‘’„…\-–—]$/.test(voor)) continue; // zinsbegin: hoofdletter zegt niets
    const w = norm(m[0]);
    if (w.length > 2 && !STOP.has(w) && !ALGEMEEN.has(w)) out.add(w);
  }
  return out;
}
/** samenstelling: w eindigt op een ander (zelfstandig) woord x van ≥4 letters ("probleemwolf" / "wolf"), met minstens 3 letters ervoor */
const eindtMet = (w: string, x: string) => x.length >= 4 && w.length >= x.length + 3 && w.endsWith(x) && !ALGEMEEN.has(x);

/** Eigennamen-regel (#469): ≥2 gedeelde eigennamen (titel + beschrijving), waarvan ≥1 in beide titels, plus een gedeeld gewoon titelwoord (ook als samenstelling) en echte overlap in de beschrijving. Eén gedeelde naam ("Trump", "Ajax") is nooit genoeg. */
function naamRegel(a: Lid, b: Lid): number {
  if (a.site && a.site === b.site) return 0; // dezelfde uitgever twee keer: een vervolg of ander artikel, geen dubbeling (#443)
  if (!a.nm || !b.nm || !a.nmT || !b.nmT) return 0;
  const gedeeld = (x: Set<string>, y: Set<string>) => [...x].filter((w) => y.has(w));
  if (gedeeld(a.nm, b.nm).length < 2 || !gedeeld(a.nmT, b.nmT).length) return 0;
  const naam = (w: string) => a.nm!.has(w) || b.nm!.has(w);
  const gewoon = (x: Set<string>) => [...x].filter((w) => w.length > 3 && !naam(w) && !ALGEMEEN.has(w));
  const ga = gewoon(a.tok), gb = gewoon(b.tok);
  if (!ga.some((w) => b.tok.has(w) || gb.some((x) => eindtMet(w, x) || eindtMet(x, w)))) return 0;
  const f = sim(a.tokS, b.tokS);
  // overlapcoëfficiënt (n / kleinste set): feedbeschrijvingen verschillen sterk in lengte, dus Jaccard haalt het nooit
  const o = f.n / Math.min(a.tokS.size, b.tokS.size);
  return f.n >= 5 && o >= 0.25 ? o * 0.7 : 0;
}

/** Titel: ruime overlap, of beschrijving als extra bewijs bij een titel die al overlapt. */
export function gelijk(a: Lid, b: Lid, naam = true): number {
  const all = sim(a.tok, b.tok);
  const e = eigen(a.tok, b.tok);
  if (e < 1) return naam ? naamRegel(a, b) : 0; // titels delen geen eigen woord (alleen samenstelling): de eigennamen-regel
  // acroniemen tellen alleen mee in de ruime regel (n>=4); in de korte regel (n>=2) zou "EU ... akkoord" te snel samengaan
  const lang = (x: Set<string>) => new Set([...x].filter((w) => w.length > 2));
  const { n, j } = sim(lang(a.tok), lang(b.tok));
  if (e >= 2 && ((j >= 0.45 && n >= 2) || (all.n >= 4 && all.j >= 0.3))) return Math.max(j, all.j);
  // beschrijving als bewijs, alleen als de titels al overlappen:
  // - 2 gedeelde titelwoorden: streng (>=8 gedeelde woorden, Jaccard >=0,5)
  // - 1 eigen woord + gedeeld acroniem (AI, EU) en >=2 gedeelde titelwoorden: >=9 gedeelde woorden, Jaccard >=0,25
  //   (echte beschrijvingen van korte feedtekst halen nooit 0,5)
  const f = sim(a.tokS, b.tokS);
  if (e >= 2 && n >= 2 && f.n >= 8 && f.j >= 0.5) return f.j * 0.9;
  if (e >= 1 && all.n - n >= 1 && n >= 2 && f.n >= 9 && f.j >= 0.25) return f.j * 0.8;
  return naam ? naamRegel(a, b) : 0;
}

/** een naam die in meer dan zoveel kandidaten van deze run voorkomt (Verstappen, Trump, Ajax) is een onderwerp, geen kenmerk van één verhaal */
const NAAM_MAX = 6;

/** alle clusters zijn (via leden die onderling gelijk zijn) aan elkaar verbonden */
function hangtSamen(ks: Cluster[]): boolean {
  const klaar = [ks[0]], rest = ks.slice(1);
  for (let veranderd = true; veranderd && rest.length;) {
    veranderd = false;
    for (const r of [...rest]) if (r.leden.some((x) => klaar.some((g) => g.leden.some((y) => gelijk(x, y) > 0)))) { klaar.push(r); rest.splice(rest.indexOf(r), 1); veranderd = true; }
  }
  return !rest.length;
}

export function cluster(cands: Cand[]): Cluster[] {
  let out: Cluster[] = [];
  const sorted = cands.sort((a, b) => a.d - b.d);
  const df = new Map<string, number>();
  const namenVan = sorted.map((c) => { const nmT = namen(c.t), nm = new Set([...nmT, ...namen((c.s || "").slice(0, 300))]); for (const w of nm) df.set(w, (df.get(w) || 0) + 1); return { nmT, nm }; });
  const zeldzaam = (x: Set<string>) => new Set([...x].filter((w) => (df.get(w) || 0) <= NAAM_MAX));
  for (const [i, c] of sorted.entries()) {
    const tk = toks(c.t), ts = new Set([...tk, ...toks((c.s || "").slice(0, 300))]);
    const lid: Lid = { tok: tk, tokS: ts, nmT: zeldzaam(namenVan[i].nmT), nm: zeldzaam(namenVan[i].nm), site: c.site };
    // per lid vergelijken (max), niet met de unie: een groot cluster mag geen lagere Jaccard geven
    // de eigennamen-regel mag geen twee losse verhalen verbinden (een overzichtsbericht over twee wedstrijden is een brug): alleen als de geraakte clusters ook onderling bij elkaar horen
    let raak = out.filter((k) => k.leden.some((l) => gelijk(lid, l, false) > 0));
    if (!raak.length) { const naamRaak = out.filter((k) => k.leden.some((l) => gelijk(lid, l) > 0)); if (naamRaak.length && hangtSamen(naamRaak)) raak = naamRaak; }
    if (!raak.length) { out.push({ key: normLink(c.href), cat: c.cat, c: [c], tok: new Set(tk), tokS: new Set(ts), leden: [lid] }); continue; }
    // past de kandidaat bij meer clusters, dan horen die bij hetzelfde verhaal: samenvoegen in het oudste
    const [k, ...rest] = raak;
    for (const r of rest) { k.c.push(...r.c); k.leden.push(...r.leden); for (const x of r.tok) k.tok.add(x); for (const x of r.tokS) k.tokS.add(x); }
    if (rest.length) out = out.filter((x) => !rest.includes(x));
    k.c.push(c); k.leden.push(lid); for (const x of tk) k.tok.add(x); for (const x of ts) k.tokS.add(x);
  }
  const prioriteit = ["f1", "voetbal", "auto", "sport"];
  for (const k of out) k.cat = prioriteit.find((cat) => k.c.some((c) => c.cat === cat)) || k.cat;
  return out;
}
