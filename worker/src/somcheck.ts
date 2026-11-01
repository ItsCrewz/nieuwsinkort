// Controle van een AI-samenvatting (#476): pure module (geen Worker-API's), getest in tests/somcheck.test.ts.
// Een kleine model gaf eens kern = kop, een samenvatting van 5 woorden en punten ["Florida","Florida"]; dat werd gecachet en elke run hergebruikt.
// Kern (ai) of samenvatting slecht = hele som af; losse slechte punten worden weggelaten (lege punten is een bestaande staat).
export type SomIn = { kop: string; ai: string; samenvatting: string; punten: string[] };
export type SomUitslag = { ok: true; som: SomIn } | { ok: false; reden: string };

const MIN_WOORDEN_SAMENVATTING = 6, MIN_WOORDEN_PUNT = 2, GELIJK = 0.8;

/** Kleine letters, accenten en leestekens weg; losse woorden. */
const woorden = (s: string) => (s || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];

/** (Bijna) gelijk: woord-Jaccard ≥ 0,8, of (met `deelvan`) `a` bestaat helemaal uit woorden van `b` (a ⊂ b). Lege tekst is nooit "gelijk". */
export function bijnaGelijk(a: string, b: string, deelvan = true): boolean {
  const x = new Set(woorden(a)), y = new Set(woorden(b));
  if (!x.size || !y.size) return false;
  let gedeeld = 0;
  for (const w of x) if (y.has(w)) gedeeld++;
  return (deelvan && gedeeld === x.size) || gedeeld / (x.size + y.size - gedeeld) >= GELIJK;
}

export function controleerSom(som: SomIn, titels: string[] = []): SomUitslag {
  const kop = som.kop || "", ai = som.ai || "", sam = som.samenvatting || "";
  if (!woorden(kop).length) return { ok: false, reden: "kop leeg" };
  if (!woorden(ai).length) return { ok: false, reden: "kern leeg" };
  if (bijnaGelijk(ai, kop)) return { ok: false, reden: "kern gelijk aan kop" };
  if (titels.some((t) => bijnaGelijk(ai, t, false))) return { ok: false, reden: "kern gelijk aan brontitel" };
  // Leeg bij een inhoudelijke kern (≥ 6 woorden) is het eerlijke antwoord op een te dunne bron (bijv. NRC-puzzels); kort maar niet leeg is verdacht.
  const nSam = woorden(sam).length;
  if (nSam < MIN_WOORDEN_SAMENVATTING && !(nSam === 0 && woorden(ai).length >= MIN_WOORDEN_SAMENVATTING)) return { ok: false, reden: "samenvatting leeg of te kort" };
  if (nSam && (bijnaGelijk(sam, kop) || bijnaGelijk(sam, ai))) return { ok: false, reden: "samenvatting gelijk aan kop of kern" };
  const gezien: string[] = [], punten: string[] = [];
  for (const p of som.punten || []) {
    if (woorden(p).length < MIN_WOORDEN_PUNT) continue;
    if ([kop, ai].some((t) => bijnaGelijk(p, t)) || bijnaGelijk(p, sam, false) || gezien.some((g) => bijnaGelijk(p, g) || bijnaGelijk(g, p))) continue;
    gezien.push(p); punten.push(p);
  }
  return { ok: true, som: { ...som, punten } };
}

export const samenvattingOk = (som: SomIn, titels: string[] = []) => controleerSom(som, titels).ok;

/** Gecachete som hergebruiken (#476): slecht = null (wordt opnieuw gemaakt), anders de som met opgeschoonde punten. */
export function zuiverSom<T extends SomIn>(som: T | null | undefined, titels: string[] = []): T | null {
  if (!som) return null;
  const c = controleerSom(som, titels);
  return c.ok ? { ...som, punten: c.som.punten } : null;
}
