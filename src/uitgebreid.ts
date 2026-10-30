import type { Item, Meer } from "./types";

// Kopje "Uitgebreid" in een artikel: nooit leeg. Keten gelijk aan de samenvattingen:
// AI-uitleg (Workers AI/Groq/Mistral, door de Worker gecachet in `diep`) -> alineas uit de bron -> tekst van het bericht zelf.
export function uitgebreidAlineas(item: Item, meer: Meer | null | undefined): string[] {
  const schoon = (l?: string[]) => (l ?? []).map((p) => p.trim()).filter(Boolean);
  const ai = schoon(meer?.uitleg);
  if (ai.length) return ai;
  const bron = schoon(meer?.uittreksel?.flatMap((b) => b.alineas ?? []));
  if (bron.length) return bron;
  const eigen = schoon([item.samenvatting, item.ai, ...(item.punten ?? [])].flatMap((t) => (t || "").split(/\n\s*\n/)));
  return eigen.length ? [...new Set(eigen)] : [item.kop?.trim() || "Geen uitgebreidere tekst beschikbaar."];
}

// Alleen artikelen zonder gecachete uitleg krijgen een nieuwe AI-aanroep (cache = `st.diep`, bewaard in KV-state).
export function zonderUitleg<T extends { key: string }>(lijst: T[], cache: Record<string, unknown>): T[] {
  return lijst.filter((m) => !cache[m.key]);
}
