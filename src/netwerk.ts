// Is de verbinding zuinig? Bepaalt hoeveel er vooraf geladen mag worden (zie voorladen.ts).
// Pure functie + dunne lezer van navigator.connection (bestaat niet in Safari/Firefox: dan 'normaal').
export type Budget = "geen" | "zuinig" | "normaal";
export type Verbinding = { saveData?: boolean; effectiveType?: string; type?: string } | null | undefined;

export function budgetVan(c: Verbinding): Budget {
  if (!c) return "normaal";
  if (c.saveData) return "geen";
  if (c.effectiveType === "slow-2g" || c.effectiveType === "2g") return "geen";
  if (c.type === "cellular" || c.effectiveType === "3g") return "zuinig"; // mobiel abonnement: geen video-bytes
  return "normaal";
}

export function netwerkBudget(): Budget {
  try {
    return budgetVan((navigator as Navigator & { connection?: Verbinding }).connection);
  } catch {
    return "normaal";
  }
}
