// Alleen inhoudelijke woorden tellen mee; vervoegingen en samenstellingen mogen aansluiten.
const STOP = new Set("de het een en of in op van voor met naar bij uit door over onder is zijn was werd worden wordt heeft hebben had die dat dit deze als ook nog niet meer maar dan er te om tot aan zich hun haar zijn zoals na per jaar volgens zegt wil kan zal zou mensen bedrijf bedrijven nieuwe eerste twee drie veel andere hoe wat geen maximaal".split(" "));
function woorden(tekst: string): string[] {
  return (tekst.toLocaleLowerCase("nl").normalize("NFD").replace(/\p{M}/gu, "").match(/[\p{L}\p{N}]+/gu) || [])
    .filter((w) => !STOP.has(w) && (w.length >= 4 || /^\d+$/.test(w)));
}
export function relevantePunten(punten: string[], kop: string, intro = "", samenvatting = ""): string[] {
  const kopwoorden = woorden(kop);
  const verbonden = (intro + " " + samenvatting).split(/(?<=[.!?])\s+/u).filter((zin) => woorden(zin).some((w) => kopwoorden.includes(w)));
  const basis = woorden(`${kop} ${verbonden.join(" ")}`);
  return punten.filter((punt) => woorden(punt).some((w) => basis.some((b) => w === b || (Math.min(w.length, b.length) >= 6 && (w.startsWith(b.slice(0, Math.max(5, b.length - 2))) || b.startsWith(w.slice(0, Math.max(5, w.length - 2))))))));
}

// Een kort-overzicht bevat meerdere zelfstandige berichten; zonder betrouwbare grenzen geen artikeltekst gebruiken.
export function verzamelUrl(url: string): boolean {
  try { return /\/kort-[^/]*-en-meer\/?$/i.test(new URL(url).pathname); } catch { return false; }
}
export function invoerBijKop(tekst: string, url: string): string {
  if (!verzamelUrl(url)) return tekst;
  const zinnen = tekst.matchAll(/[.!?]\s+/gu);
  for (const grens of zinnen) {
    const begin = tekst.slice(0, grens.index + 1);
    if (!/(?:\b(?:bijv|o\.a|n\.v)\.)$/iu.test(begin)) return begin;
  }
  return tekst;
}
