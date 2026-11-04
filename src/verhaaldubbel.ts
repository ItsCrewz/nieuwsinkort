import { eenPerUitgever } from "./uitgever";

// Strenge herkenning van dezelfde rechtszaak of wedstrijduitslag, zonder AI.
type Verhaal = { kop: string; tekst?: string; tijd: number };
const namen = (s: string) => new Set((s.match(/\b[A-Z][a-z]{3,}\b/g) || []).map((w) => w.toLowerCase().replace(/^internazionale$/, "inter")));
const bedrag = (s: string): number | undefined => {
  const ton = s.match(/\b(een|twee|drie|vier|vijf|zes|zeven|acht|negen|\d+)\s+ton\b/i);
  if (ton) return (Number(ton[1]) || ["een", "twee", "drie", "vier", "vijf", "zes", "zeven", "acht", "negen"].indexOf(ton[1].toLowerCase()) + 1) * 100000;
  const n = s.match(/\b(\d{1,3}(?:[.]\d{3})+|\d{5,})\s*euro\b/i);
  return n ? Number(n[1].replace(/\./g, "")) : undefined;
};
export function wedstrijdTeams(kop: string): string[] {
  return [...kop.matchAll(/\b([A-Z][a-z]{3,})\s+(?:verliest|verloor)\s+(?:(?:ruim|thuis|uit|opnieuw|nipt|met\s+[0-9]+[-–][0-9]+)\s+)*(?:van|tegen)\s+([A-Z][a-z]{3,})/g)].flatMap((m) => [m[1], m[2]].map((x) => x.toLowerCase().replace(/^internazionale$/, "inter")));
}
const KOSTEN = /advocaatkosten|advocatenkosten|verdedigingskosten/i;
// alleen een hoofdclaim telt: "eist/vraagt/claimt ... kosten of bedrag ... terug / van de staat" of "voor de rechter over advocaatkosten"; kosten als achtergrond ("terug op podium na hoge advocaatkosten") niet
export function kostenclaim(v: Verhaal): boolean {
  const tekst = `${v.kop} ${v.tekst || ""}`;
  if (/\bvoor de rechter over (?:de |hoge )?(?:advocaat|advocaten|verdedigings)kosten/i.test(v.kop)) return true;
  if (!/\b(?:eist|eisen|vraagt|claimt|wil)\b/i.test(v.kop) || !/\bterug\b|\bvan de (?:Nederlandse )?staat\b/i.test(v.kop)) return false;
  return KOSTEN.test(v.kop) || (bedrag(v.kop) !== undefined && KOSTEN.test(tekst));
}
// zaakidentiteit: een andere rechtszaak (of een andere partij dan de staat) is een ander verhaal, ook bij gelijk bedrag
const partij = (t: string) => { const m = t.match(/\b(?:rechts)?zaak\s+tegen\s+(?:de\s+|zijn\s+|haar\s+)?([a-zà-ÿ]+)/i); return m && !/^(?:nederlandse|staat|overheid|rechtbank)$/i.test(m[1]) ? m[1].toLowerCase() : undefined; };
const andereZaak = (t: string) => /\b(?:andere|aparte|tweede|nieuwe)\s+(?:rechts)?(?:zaak|procedure)\b/i.test(t);
export function kostenGelijk(a: Verhaal, b: Verhaal): boolean {
  const ta = `${a.kop} ${a.tekst || ""}`, tb = `${b.kop} ${b.tekst || ""}`;
  if (andereZaak(ta) || andereZaak(tb) || partij(ta) !== partij(tb)) return false;
  const ba = bedrag(ta), bb = bedrag(tb);
  return ba !== undefined && bb !== undefined && Math.abs(ba - bb) <= Math.max(ba, bb) * 0.1;
}
/** twee kostenclaims met onderling afwijkend bedrag of een andere zaak: nooit in één cluster, ook niet via titel- of naamregel */
export const kostenBotst = (a: Verhaal, b: Verhaal) => kostenclaim(a) && kostenclaim(b) && !kostenGelijk(a, b);
// kostenbedrag in de kop ("claimen ruim vier ton kosten voor X"): het werkwoord doet er niet toe, het bedrag in de kop mét kosten en advocaten in de tekst wel
const kostenKop = (v: Verhaal) => bedrag(v.kop) !== undefined && /\bkosten\b|advocaatkosten|advocatenkosten|verdedigingskosten/i.test(v.kop) && /advocat|verdediging/i.test(`${v.kop} ${v.tekst || ""}`);
export function zelfdeVerhaal(a: Verhaal, b: Verhaal): boolean {
  if (!a.tijd || !b.tijd || Math.abs(a.tijd - b.tijd) > 12 * 3600e3) return false;
  const na = namen(a.kop), nb = namen(b.kop);
  const gedeeld = [...na].filter((n) => nb.has(n)).length;
  // zelfde persoon, zelfde bedrag aan kosten, in beide koppen: één naam is genoeg (de ene kop noemt vaak alleen de achternaam)
  if (gedeeld === 1 && kostenKop(a) && kostenKop(b)) return kostenGelijk(a, b);
  if (gedeeld < 2) return false;
  const ta = `${a.kop} ${a.tekst || ""}`, tb = `${b.kop} ${b.tekst || ""}`;
  if (kostenclaim(a) && kostenclaim(b)) return kostenGelijk(a, b);
  const wedstrijd = (kop: string) => /\b(?:verliest|verloor)\s+(?:(?:ruim|thuis|uit|opnieuw|nipt|met\s+[0-9]+[-–][0-9]+)\s+)*(?:van|tegen)\s+[A-Z]/.test(kop) && !/transfer|trainer|ontslag/i.test(kop);
  const wa = wedstrijdTeams(a.kop), wb = wedstrijdTeams(b.kop);
  return /wedstrijd|voetbal|champions league|eredivisie|premier league/i.test(ta) && /wedstrijd|voetbal|champions league|eredivisie|premier league/i.test(tb) && wedstrijd(a.kop) && wedstrijd(b.kop) && wa.length === 2 && wb.length === 2 && wa.every((x) => wb.includes(x));

}

type Item = { kop?: string; ai?: string; samenvatting?: string; t?: number; tijd?: string; bronnen?: { site: string; href: string }[]; beelden?: string[]; punten?: string[]; meer?: string; uur?: boolean };
export function ontdubbelVerhalen<T extends Item>(items: T[], routineItems: ReadonlySet<T> = new Set()): T[] {
  const groepen: T[][] = [];
  const verhaal = (i: Item) => ({ kop: i.kop || "", tekst: `${i.ai || ""} ${i.samenvatting || ""}`, tijd: i.t || 0 });
  for (const i of items) {
    const g = groepen.find((groep) => groep.every((x) => zelfdeVerhaal(verhaal(x), verhaal(i))));
    if (g) g.push(i); else groepen.push([i]);
  }
  return groepen.map((g) => {
    if (g.length === 1) return g[0];
    const hoofd = [...g].sort((a, b) => (b.bronnen?.length || 0) - (a.bronnen?.length || 0) || (b.t || 0) - (a.t || 0))[0];
    const bronnen = eenPerUitgever([hoofd, ...g].flatMap((x) => x.bronnen || [])).slice(0, 6);
    const routine = g.find((x) => routineItems.has(x));
    const inhoud = routine ? { samenvatting: routine.samenvatting || hoofd.samenvatting, punten: routine.punten?.length ? routine.punten : hoofd.punten, meer: routine.meer || hoofd.meer } : {};
    const beelden = [...new Set(g.flatMap((x) => x.beelden || []))];
    const nieuwste = g.reduce((a, b) => (b.t || 0) > (a.t || 0) ? b : a);
    return { ...hoofd, ...inhoud, bronnen, ...(beelden.length ? { beelden } : {}), t: nieuwste.t, tijd: nieuwste.tijd };
  });
}
