// Dubbele inhoud in een artikel (#488): puntenlijst en "Uitgebreid" tonen alleen wat niet al in intro, samenvatting en punten staat.
// Pure module (ook door scripts/meet-dubbel.mjs gebruikt), deterministisch, geen AI. Maat: dekking = deel van de inhoudswoorden (lichte stam,
// getallen als 4.900 blijven heel) van een zin of punt dat al in de bekende tekst voorkomt.
export const DREMPEL_PUNT = 0.75;      // punt met ≥ 75% van zijn inhoudswoorden in intro+samenvatting staat er al in
export const DREMPEL_ZIN = 0.75;       // idem voor een zin uit Uitgebreid t.o.v. intro+samenvatting+punten
export const MIN_NIEUWE_PUNTEN = 2;    // minder nieuwe punten: hele lijst weg
export const MIN_NIEUWE_ZINNEN = 2;    // minder nieuwe zinnen: sectie Uitgebreid weg
const MIN_ZINWOORDEN = 3;              // zin met minder inhoudswoorden telt niet als herhaling of als nieuwe inhoud (losse bijzin)

const STOP = new Set("een het van voor met bij naar door over uit aan ook dat die dit deze zijn was waren wordt worden werd heeft hebben had hij zij haar hun niet maar als dan nog wel per zal zou kan kunnen moet wil gaat er om te zo nu in op is de en of we je u ze zich ons onze veel meer ander andere".split(" "));
const stam = (w: string) => (w.length >= 5 ? w.replace(/(en|e|s|n|t|d)$/, "") : w);

/** Inhoudswoorden (kleine letters, zonder accenten en lidwoorden/hulpwoorden, lichte stam); getallen met punt of komma blijven heel. */
export function inhoudswoorden(s: string): string[] {
  const t = (s || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().match(/\p{N}+(?:[.,]\p{N}+)*|\p{L}+/gu) || [];
  return t.map((w) => w.replace(/[.,]/g, "")).filter((w) => (w.length >= 3 || /\d/.test(w)) && !STOP.has(w)).map(stam);
}

/** Deel van de inhoudswoorden van `tekst` dat in `bekend` voorkomt (0..1); zonder inhoudswoorden 0. */
export function dekking(tekst: string, bekend: string): number {
  const w = inhoudswoorden(tekst);
  if (!w.length) return 0;
  const k = new Set(inhoudswoorden(bekend));
  return w.filter((x) => k.has(x)).length / w.length;
}

export const zinnen = (alinea: string): string[] => (alinea || "").split(/(?<=[.!?])\s+(?=[\p{Lu}\p{N}"'‘“(])/u).map((z) => z.trim()).filter(Boolean);
const alineas = (t?: string) => (t || "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

/** Punten die niet al in intro of samenvatting staan; bij minder dan 2 nieuwe punten (en dubbele punten onderling) blijft er niets over. */
export function nieuwePunten(punten: string[] | undefined, intro: string | undefined, samenvatting: string | undefined): string[] {
  const bekend = `${intro || ""}\n${samenvatting || ""}`;
  const uit: string[] = [];
  for (const p of punten ?? []) {
    if (!p?.trim() || dekking(p, bekend) >= DREMPEL_PUNT || uit.some((g) => dekking(p, g) >= DREMPEL_PUNT)) continue;
    uit.push(p);
  }
  return uit.length >= MIN_NIEUWE_PUNTEN ? uit : [];
}

/** Alinea's met alleen de zinnen die niet al in `bekend` staan; te weinig nieuwe zinnen: lege lijst (sectie verbergen). */
export function nieuweAlineas(tekst: string[], bekend: string[]): string[] {
  const b = bekend.join("\n");
  let n = 0;
  const uit: string[] = [];
  for (const a of tekst) {
    const nieuw = zinnen(a).filter((z) => inhoudswoorden(z).length >= MIN_ZINWOORDEN && dekking(z, b) < DREMPEL_ZIN);
    if (!nieuw.length) continue;
    n += nieuw.length;
    uit.push(nieuw.join(" "));
  }
  return n >= MIN_NIEUWE_ZINNEN ? uit : [];
}

type Tekst = { ai?: string; samenvatting?: string; punten?: string[] };
/** Wat de detailpagina toont: de puntenlijst (of niets) en de bronnen voor Uitgebreid in volgorde van voorkeur, elk ontdaan van herhaling. */
export function ontdubbel(item: Tekst, bronnen: string[][]): { punten: string[]; uitgebreid: string[]; bron: number } {
  const punten = nieuwePunten(item.punten, item.ai, item.samenvatting);
  const bekend = [item.ai || "", ...alineas(item.samenvatting), ...punten];
  for (let i = 0; i < bronnen.length; i++) {
    const u = nieuweAlineas(bronnen[i], bekend);
    if (u.length) return { punten, uitgebreid: u, bron: i };
  }
  return { punten, uitgebreid: [], bron: -1 };
}
