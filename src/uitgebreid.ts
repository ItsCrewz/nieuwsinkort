import type { Bron, Item, Meer } from "./types";
import { ontdubbel } from "./dubbel";

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

// Wat onder "Uitgebreid" komt (#488): dezelfde keten, maar zonder zinnen die al in intro, samenvatting of punten staan. Is een bron te dun
// (zonder nieuwe zinnen), dan probeert hij de volgende; blijft er niets over, dan verdwijnt de sectie (lege lijst). Ook één nieuw punt blijft zichtbaar.
// De terugval op samenvatting+ai+punten (puur herhaling) bestaat hier niet meer; een artikel zonder enige andere tekst houdt de oude terugval.
export function uitgebreidOntdubbeld(item: Item, meer: Meer | null | undefined): { punten: string[]; uitgebreid: string[]; uitleg: boolean } {
  const schoon = (l?: string[]) => (l ?? []).map((p) => p.trim()).filter(Boolean);
  const o = ontdubbel(item, [schoon(meer?.uitleg), schoon(meer?.uittreksel?.flatMap((b) => b.alineas ?? []))]);
  if (o.uitgebreid.length || item.ai?.trim() || item.samenvatting?.trim()) return { punten: o.punten, uitgebreid: o.uitgebreid, uitleg: o.bron === 0 };
  return { punten: item.punten ?? [], uitgebreid: uitgebreidAlineas(item, meer), uitleg: !!schoon(meer?.uitleg).length };
}

// De URL identificeert het oorspronkelijke artikel, ook bij gelijke bronnamen.
export function filterMeer(meer: Meer | null, bronnen: Bron[] | undefined): Meer | null {
  if (!meer || !bronnen) return meer;
  const urls = new Set(bronnen.map((b) => b.href).filter(Boolean));
  return { ...meer, perBron: meer.perBron?.filter((b) => urls.has(b.href)), uittreksel: meer.uittreksel?.filter((b) => urls.has(b.href)) };
}
