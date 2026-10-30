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
/** tok/tokS: titeltokens resp. titel + begin van de beschrijving (alleen extra bewijs) */
export type Lid = { tok: Set<string>; tokS: Set<string> };
/** tok/tokS hier zijn de unie van de leden (voor covered() in index.ts); vergelijken gebeurt per lid in `leden` */
export type Cluster = { key: string; cat: string; c: Cand[]; tok: Set<string>; tokS: Set<string>; leden: Lid[] };

/** Titel: ruime overlap, of beschrijving als extra bewijs bij een titel die al overlapt. */
export function gelijk(a: Lid, b: Lid): number {
  const all = sim(a.tok, b.tok);
  const e = eigen(a.tok, b.tok);
  if (e < 1) return 0;
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
  return 0;
}

export function cluster(cands: Cand[]): Cluster[] {
  let out: Cluster[] = [];
  for (const c of cands.sort((a, b) => a.d - b.d)) {
    const tk = toks(c.t), ts = new Set([...tk, ...toks((c.s || "").slice(0, 300))]);
    const lid = { tok: tk, tokS: ts };
    // per lid vergelijken (max), niet met de unie: een groot cluster mag geen lagere Jaccard geven
    const raak = out.filter((k) => k.leden.some((l) => gelijk(lid, l) > 0));
    if (!raak.length) { out.push({ key: normLink(c.href), cat: c.cat, c: [c], tok: new Set(tk), tokS: new Set(ts), leden: [lid] }); continue; }
    // past de kandidaat bij meer clusters, dan horen die bij hetzelfde verhaal: samenvoegen in het oudste
    const [k, ...rest] = raak;
    for (const r of rest) { k.c.push(...r.c); k.leden.push(...r.leden); for (const x of r.tok) k.tok.add(x); for (const x of r.tokS) k.tokS.add(x); }
    if (rest.length) out = out.filter((x) => !rest.includes(x));
    k.c.push(c); k.leden.push(lid); for (const x of tk) k.tok.add(x); for (const x of ts) k.tokS.add(x);
  }
  return out;
}
