// Soortlabels uit publicatiefeeds zijn geen omschrijving van het besluit.
const LABEL = /^(?:verkeersbesluit(?:\s+of\s+-?mededeling)?|gemeenteblad|provinciaal blad|waterschapsblad|staatscourant|omgevingsvergunning|bekendmaking|vergunning|melding)\s*:?\s*$/iu;
const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", eacute: "é", euml: "ë" };

export function schoneBekendmakingTekst(tekst: string): string {
  let t = tekst;
  for (let i = 0; i < 2; i++) t = t.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/giu, (geheel, code: string) => {
    if (code[0] !== "#") return ENT[code.toLowerCase()] ?? geheel;
    const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
    return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : " ";
  });
  return t.replace(/<\/?(?:b|strong)\b[^>]*>?/giu, "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

export const bekendmakingFallback = "Officiële bekendmaking. De volledige tekst staat bij de bron.";
export function bekendmakingTekst(tekst: string): string {
  const schoon = schoneBekendmakingTekst(tekst);
  return LABEL.test(schoon) ? "" : schoon;
}
export function isBekendmakingLabel(tekst: string): boolean {
  return LABEL.test(schoneBekendmakingTekst(tekst));
}

export function toonBekendmaking<T extends { ruw?: boolean; ai?: string; samenvatting?: string; bronnen?: { site: string; href: string }[] }>(item: T): T {
  if (!item.ruw || !item.bronnen?.some((b) => /offici[eë]le bekendmakingen/iu.test(b.site) || /(?:^|\.)officielebekendmakingen\.nl(?:[/:]|$)/iu.test(b.href))) return item;
  const ai = bekendmakingTekst(item.ai || "");
  const samenvatting = bekendmakingTekst(item.samenvatting || "");
  return { ...item, ai: ai || (!samenvatting ? bekendmakingFallback : ""), samenvatting };
}
