// Dubbele sportitems samenvoegen na de AI-stap (#440): pure module, getest in tests/sport-dubbel.test.ts.
// cluster() ziet "1500"/"500" niet als eigen woord (eigen() in cluster.ts), dus feedtitels over dezelfde race
// blijven los. Hier: zelfde eigennaam(en) + zelfde afstand in de kop, binnen 12 uur. Conservatief: bij twijfel los.
import { normLink } from "./cluster";
import { uniekeBeelden } from "../../src/beeld";

// Rol-/bijvoeglijke woorden die met een hoofdletter beginnen (zinsbegin) en geen naam zijn.
const ROL = /^(?:schaats|wielren|judo|dart|zwem|atleet|sporter|nederland|olympisch|wereld|europe)/i;
// Plaats/evenement achter een voorzetsel is geen persoon ("in Thialf", "bij Heerenveen").
const VOORZETSEL = new Set("in op bij te uit naar voor tegen tijdens na".split(" "));
const TUSSEN = new Set("van de der den ten ter".split(" "));
const AFSTAND = /(\d{1,2}(?:\.\d{3})+|\d+)\s?(km|kilometer|m|meter)\b/gi;

/** afstanden in meter ("1.500 meter" = "1500 m" = 1500); null bij een getal zonder eenheid van 3+ cijfers (twijfel) */
export function afstanden(kop: string): number[] | null {
  const uit: number[] = [];
  const rest = kop.replace(AFSTAND, (_, g: string, e: string) => { const v = Number(g.replace(/\./g, "")); uit.push(/^k/i.test(e) ? v * 1000 : v); return " "; });
  if (/\d[\d.,]{2,}/.test(rest)) return null;
  return [...new Set(uit)].sort((a, b) => a - b);
}

/** achternamen: laatste woord van elke reeks hoofdletterwoorden (tussenvoegsels erbinnen), zonder rolwoorden, plaatsen en acroniemen */
export function achternamen(kop: string): string[] {
  const w = kop.split(/\s+/).map((x) => x.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")).filter(Boolean);
  const uit = new Set<string>();
  for (let i = 0; i < w.length; i++) {
    if (!/^\p{Lu}/u.test(w[i])) continue;
    const reeks: string[] = [];
    let j = i;
    // tussenvoegsels ("van der") horen erbij als er een hoofdletterwoord op volgt
    const hoofd = (k: number) => { while (TUSSEN.has(w[k] || "")) k++; return /^\p{Lu}/u.test(w[k] || ""); };
    while (j < w.length && (/^\p{Lu}/u.test(w[j]) || (TUSSEN.has(w[j]) && hoofd(j)))) reeks.push(w[j++]);
    const voor = i ? w[i - 1] : "";
    i = j - 1;
    if (VOORZETSEL.has(voor)) continue;
    const naam = reeks.filter((x) => !ROL.test(x) && !/-/.test(x) && !/^\p{Lu}{2,}$/u.test(x) && !TUSSEN.has(x));
    if (naam.length) uit.add(naam[naam.length - 1].toLowerCase());
  }
  return [...uit].sort();
}

type Item = { cat: string; kop?: string; t?: number; bronnen?: { site: string; href: string }[]; beelden?: string[]; [k: string]: any };
const sleutel = (i: Item) => {
  const a = afstanden(i.kop || ""), n = achternamen(i.kop || "");
  return a && a.length && n.length ? `${n.join("+")}|${a.join("+")}` : "";
};

/** voegt sportitems met dezelfde namen en afstand samen: meest complete (meeste bronnen, dan nieuwste) blijft, bronnen unie; behoudt de volgorde */
export function ontdubbelSport<T extends Item>(items: T[]): { items: T[]; samengevoegd: number } {
  const groepen: T[][] = [];
  const sl = new Map<T, string>();
  for (const i of items) {
    const s = i.cat === "sport" ? sleutel(i) : "";
    sl.set(i, s);
    const g = s && groepen.find((g) => sl.get(g[0]) === s && g.some((x) => Math.abs((x.t || 0) - (i.t || 0)) <= 12 * 3600e3));
    if (g) g.push(i); else groepen.push([i]);
  }
  let samengevoegd = 0;
  const uit = groepen.map((g) => {
    if (g.length < 2) return g[0];
    samengevoegd += g.length - 1;
    const hoofd = [...g].sort((a, b) => (b.bronnen?.length || 0) - (a.bronnen?.length || 0) || (b.t || 0) - (a.t || 0))[0];
    // bronnen van het hoofditem eerst, zodat de eerste bron (sleutel van "Lees verder") stabiel blijft
    const bronnen = [...new Map([hoofd, ...g].flatMap((x) => x.bronnen || []).map((b) => [normLink(b.href), b])).values()];
    const beelden = uniekeBeelden(g.flatMap((x) => x.beelden || []));
    const nieuwste = g.reduce((m, x) => ((x.t || 0) > (m.t || 0) ? x : m), g[0]);
    return { ...hoofd, bronnen: bronnen.slice(0, 6), ...(beelden.length ? { beelden } : {}), t: nieuwste.t, tijd: nieuwste.tijd };
  });
  return { items: uit, samengevoegd };
}
