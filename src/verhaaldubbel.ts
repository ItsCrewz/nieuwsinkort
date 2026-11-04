// Strenge herkenning van dezelfde rechtszaak of wedstrijduitslag, zonder AI.
type Verhaal = { kop: string; tekst?: string; tijd: number };
const namen = (s: string) => new Set((s.match(/\b[A-Z][a-z]{3,}\b/g) || []).map((w) => w.toLowerCase().replace(/^internazionale$/, "inter")));
const bedrag = (s: string): number | undefined => {
  const ton = s.match(/\b(een|twee|drie|vier|vijf|zes|zeven|acht|negen|\d+)\s+ton\b/i);
  if (ton) return (Number(ton[1]) || ["een", "twee", "drie", "vier", "vijf", "zes", "zeven", "acht", "negen"].indexOf(ton[1].toLowerCase()) + 1) * 100000;
  const n = s.match(/\b(\d{1,3}(?:[.]\d{3})+|\d{5,})\s*euro\b/i);
  return n ? Number(n[1].replace(/\./g, "")) : undefined;
};
export function zelfdeVerhaal(a: Verhaal, b: Verhaal): boolean {
  if (!a.tijd || !b.tijd || Math.abs(a.tijd - b.tijd) > 12 * 3600e3) return false;
  const na = namen(a.kop), nb = namen(b.kop);
  if ([...na].filter((n) => nb.has(n)).length < 2) return false;
  const ta = `${a.kop} ${a.tekst || ""}`, tb = `${b.kop} ${b.tekst || ""}`;
  const rechtszaak = /advocaatkosten|advocatenkosten|verdedigingskosten/i;
  if (rechtszaak.test(ta) && rechtszaak.test(tb)) {
    const ba = bedrag(ta), bb = bedrag(tb);
    return !ba || !bb || Math.abs(ba - bb) <= Math.max(ba, bb) * 0.1;
  }
  const uitslag = /\b(verliest|verloor|nederlaag|verlies)\b/i;
  return uitslag.test(a.kop) && uitslag.test(b.kop);
}

type Item = { kop?: string; ai?: string; samenvatting?: string; t?: number; tijd?: string; bronnen?: { site: string; href: string }[]; beelden?: string[] };
export function ontdubbelVerhalen<T extends Item>(items: T[]): T[] {
  const groepen: T[][] = [];
  const verhaal = (i: Item) => ({ kop: i.kop || "", tekst: `${i.ai || ""} ${i.samenvatting || ""}`, tijd: i.t || 0 });
  for (const i of items) {
    const g = groepen.find((groep) => groep.every((x) => zelfdeVerhaal(verhaal(x), verhaal(i))));
    if (g) g.push(i); else groepen.push([i]);
  }
  return groepen.map((g) => {
    if (g.length === 1) return g[0];
    const hoofd = [...g].sort((a, b) => (b.bronnen?.length || 0) - (a.bronnen?.length || 0) || (b.t || 0) - (a.t || 0))[0];
    const gezien = new Set<string>();
    const bronnen = [hoofd, ...g].flatMap((x) => x.bronnen || []).filter((b) => {
      const sleutel = b.site.toLowerCase().replace(/\.nl$/, "").replace(/\s+(voetbal|sport|formule 1)$/, "");
      if (gezien.has(sleutel)) return false;
      gezien.add(sleutel); return true;
    }).slice(0, 6);
    const beelden = [...new Set(g.flatMap((x) => x.beelden || []))];
    const nieuwste = g.reduce((a, b) => (b.t || 0) > (a.t || 0) ? b : a);
    return { ...hoofd, bronnen, ...(beelden.length ? { beelden } : {}), t: nieuwste.t, tijd: nieuwste.tijd };
  });
}
