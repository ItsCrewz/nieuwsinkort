// Bewuste weigeringen en ontoereikende invoer mogen geen nieuwsbericht worden.
import { schoon } from "./extractief";

export function weigerzin(tekst: string): boolean {
  const s = (tekst || "").replace(/[’‘]/g, "'").replace(/\s+/g, " ");
  return /\b(?:de bron|het artikel|de tekst|deze tekst|dit onderwerp|dit bericht)\b[^.!?]{0,80}\b(?:niet beschikbaar|ontbreekt|ontbreken|geen (?:bruikbare |verdere |voldoende )?(?:tekst|informatie|gegevens|inhoud))\b|\bgeen (?:bruikbare |verdere |voldoende )?(?:informatie|tekst|gegevens)\b[^.!?]{0,80}\b(?:de bron|het artikel|de tekst|deze tekst|dit onderwerp|dit bericht)\b|\b(?:kan|kunnen)\s+(?:ik\s+|we\s+|wij\s+)?geen\s+(?:goede\s+|betrouwbare\s+)?(?:samenvatting|informatie|antwoord)\b|\b(?:i cannot|i can't|i am sorry|i'm sorry|as an ai)\b|\b(?:the source|the article|this text)\b[^.!?]{0,80}\b(?:not available|unavailable|does not contain|contains no)\b/i.test(s);
}

export function isWeigering(item: { kop?: string; ai?: string; samenvatting?: string; punten?: string[] }): boolean {
  return /^\s*geen (?:informatie|nieuws)\b/i.test(item.kop || "") || [item.kop, item.ai, item.samenvatting, ...(Array.isArray(item.punten) ? item.punten : [])].some((s) => typeof s === "string" && weigerzin(s));
}

/** De titel alleen is geen onderbouwing; herhaalde titel telt niet als beschrijving. */
export function bruikbareInvoer(bronnen: { t?: string; s?: string; artikel?: string[] }[]): boolean {
  return bronnen.some((b) => {
    const titel = schoon(b.t || "").toLowerCase().replace(/[\W_]+/gu, " ").trim();
    let tekst = schoon([b.s || "", ...(b.artikel || [])].join(" "));
    if (titel && schoon(b.s || "").toLowerCase().replace(/[\W_]+/gu, " ").trim() === titel) tekst = schoon((b.artikel || []).join(" "));
    const woorden = tekst.match(/[\p{L}\p{N}]{2,}/gu) || [];
    return tekst.length >= 60 && woorden.length >= 10 && new Set(woorden.map((w) => w.toLowerCase())).size >= 8 && !weigerzin(tekst);
  });
}
