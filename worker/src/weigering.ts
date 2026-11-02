// Bewuste weigeringen en ontoereikende invoer mogen geen nieuwsbericht worden.
import { schoon } from "./extractief";

export function weigerzin(tekst: string): boolean {
  const s = (tekst || "").replace(/[’‘]/g, "'").replace(/\s+/g, " ");
  return /\b(?:de bron|de brontekst|het artikel|de tekst|deze tekst)\b[^.!?]{0,80}\b(?:niet beschikbaar|ontbreekt|ontbreken|geen (?:bruikbare |verdere |voldoende )?(?:tekst|informatie|gegevens|inhoud))\b|\bgeen (?:bruikbare |verdere |voldoende )?(?:informatie|tekst|gegevens)\s+beschikbaar\s+(?:over|voor)\s+(?:dit onderwerp|dit bericht|deze tekst|het artikel)\b|\b(?:ik|wij|we)\s+kan(?:nen)?\s+(?:dit artikel|deze tekst|het artikel|de tekst)\s+niet\s+samenvatten\b|\b(?:ik|wij|we)\s+kan(?:nen)?\s+geen\s+(?:goede\s+|betrouwbare\s+)?samenvatting\b|\b(?:i cannot|i can't)\s+(?:summari[sz]e|summari[sz]ing)\b|\bas an ai\b|\b(?:i am sorry|i'm sorry)[^.!?]{0,80}\bno information\b|\bno information is available about this topic\b|\b(?:the source|the article|this text)\b[^.!?]{0,80}\b(?:not available|unavailable|does not contain|contains no)\b/i.test(s);
}

export function isWeigering(item: { kop?: string; ai?: string; samenvatting?: string; punten?: string[] }): boolean {
  return [item.kop, item.ai, item.samenvatting, ...(Array.isArray(item.punten) ? item.punten : [])].some((s) => typeof s === "string" && weigerzin(s));
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
