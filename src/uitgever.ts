/** sleutel die alleen een rubriekstaart en ".nl" weghaalt ("AD Formule 1" = "AD", "NU.nl Voetbal" = "NU.nl"); "The Verge" en "The Decoder" blijven verschillend (anders dan uitgever()) */
export const bronSleutel = (site: string) => site.trim().toLowerCase().replace(/\s+(voetbal|football|formule 1|f1|auto|sport)$/, "").replace(/\.nl$/, "");
/** één bron per uitgever ("AD" = "AD Formule 1"): de eerste blijft, volgorde behouden (#443) */
export function eenPerUitgever<T extends { site: string }>(bronnen: T[]): T[] {
  const gezien = new Set<string>();
  return bronnen.filter((b) => { const u = bronSleutel(b.site); if (gezien.has(u)) return false; gezien.add(u); return true; });
}

