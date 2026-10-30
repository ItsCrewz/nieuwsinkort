import type { Item, Meer } from "./types";

export function isAiSamenvatting(item: Item): boolean {
  return !item.ruw && !!(item.ai?.trim() || item.samenvatting?.trim() || item.punten?.some((p) => p.trim()));
}

export function isAiUitgebreid(item: Item, meer: Meer | null | undefined): boolean {
  if (meer?.uitleg?.some((p) => p.trim())) return true;
  if (meer?.uittreksel?.some((b) => b.alineas?.some((p) => p.trim()))) return false;
  return isAiSamenvatting(item);
}

export function AiVermelding({ tonen }: { tonen: boolean }) {
  return tonen ? <p className="ai-vermelding">Samenvatting gemaakt met AI</p> : null;
}
