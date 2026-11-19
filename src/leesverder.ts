import type { Item } from "./types";

// Ook ruwe berichten kunnen op de kaart ingekort zijn en bronnen hebben.
export function heeftLeesVerder(item: Item): boolean {
  return !!(item.meer || item.ai?.trim() || item.samenvatting?.trim() || item.punten?.length);
}

// #1278: de zichtbare tekst "Lees verder" blijft vooraan, de kop maakt de bestemming herkenbaar voor schermlezers.
export function leesVerderNaam(kop: string): string {
  const k = kop.replace(/\s+/g, " ").trim();
  return k ? `Lees verder: ${k}` : "Lees verder";
}

export function detailInhoud(item: Item) {
  return {
    paragraphs: (item.samenvatting || "").split(/\n\s*\n/).filter((p) => p.trim()),
    punten: item.punten ?? [],
    bronnen: item.bronnen ?? [],
  };
}

export const fotos = (it: Item): string[] => (it.beelden?.length ? it.beelden : it.beeld ? [it.beeld] : []);
export const bronnenTekst = (n: number) => `${n} ${n === 1 ? "bron" : "bronnen"}`;
