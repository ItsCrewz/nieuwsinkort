// Dubbele inhoud in een artikel (#488): puntenlijst en "Uitgebreid" tonen alleen wat niet al in intro, samenvatting en punten staat.
// Pure module (ook door scripts/meet-dubbel.mjs gebruikt), deterministisch, geen AI. Maat: dekking = deel van de inhoudswoorden (lichte stam,
// getallen als 4.900 blijven heel) van een zin of punt dat al in de bekende tekst voorkomt.
export const DREMPEL_PUNT = 1;      // punt met 100% van zijn inhoudswoorden in intro+samenvatting staat er al in
export const DREMPEL_ZIN = 1;       // 100% voor een zin uit Uitgebreid t.o.v. intro+samenvatting+punten
export const MIN_NIEUWE_PUNTEN = 1;
export const MIN_NIEUWE_ZINNEN = 1;

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

// Getallen en mogelijke eigennamen vergelijken we letterlijk, niet via de lichte stam.
function nieuwFeit(tekst: string, bekend: string): boolean {
  const tokens = (s: string) => s.normalize("NFC").match(/[\p{L}\p{M}]+|\p{N}+(?:[.,]\p{N}+)*/gu) || [];
  const bekende = new Set(tokens(bekend).map((w) => w.toLocaleLowerCase("nl")));
  return tokens(tekst).some((w) => (/^\p{N}/u.test(w) || /^\p{Lu}/u.test(w)) && !bekende.has(w.toLocaleLowerCase("nl")));
}
// Vergelijk met één bronzin: ontkenningen en tijdsaanduidingen veranderen de betekenis.
const bijzonder = (s: string) => new Set((s.toLowerCase().match(/\b(?:niet|geen|nooit|morgen|vandaag|gisteren|overmorgen|maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag|januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december)\b|\d{1,2}:\d{2}/gu) || []));
function herhaling(tekst: string, bekend: string): boolean {
  return bekend.split(/\n/).flatMap(zinnen).some((bron) => {
    const a = bijzonder(tekst), b = bijzonder(bron);
    return [...a].every((x) => b.has(x)) && [...b].every((x) => a.has(x)) && !nieuwFeit(tekst, bron) && dekking(tekst, bron) === 1;
  });
}
const verwijzing = /^["'‘“(]*\s*(?:die|dit|deze|dat|hij|zij|ze|het|hun|haar|zijn|hem)\b/iu;

/** Punten die niet al in intro of samenvatting staan; dubbele punten onderling verdwijnen. */
export function nieuwePunten(punten: string[] | undefined, intro: string | undefined, samenvatting: string | undefined): string[] {
  const bekend = `${intro || ""}\n${samenvatting || ""}`;
  const uit: string[] = [];
  for (const p of punten ?? []) {
    if (!p?.trim() || herhaling(p, bekend) || uit.some((g) => herhaling(p, g))) continue;
    uit.push(p);
  }
  return uit.length >= MIN_NIEUWE_PUNTEN ? uit : [];
}

/** Alinea's met nieuwe zinnen en zo nodig hun context; volledig dubbele tekst levert een lege lijst op. */
export function nieuweAlineas(tekst: string[], bekend: string[]): string[] {
  const b = bekend.join("\n");
  const z = tekst.flatMap((a, alinea) => zinnen(a).map((zin) => ({ zin, alinea })));
  const behoud = z.map(({ zin }) => !herhaling(zin, b));
  // Een behouden verwijszin heeft ook haar voorganger nodig, zo nodig over alineagrenzen heen.
  for (let i = z.length - 1; i > 0; i--) if (behoud[i] && verwijzing.test(z[i].zin)) behoud[i - 1] = true;
  const uit: string[] = [];
  for (let i = 0; i < z.length; i++) if (behoud[i]) uit[z[i].alinea] = [uit[z[i].alinea], z[i].zin].filter(Boolean).join(" ");
  return uit.filter(Boolean);
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
