import type { ReactNode } from "react";

export function TabBriefing({ text, aantal, children }: { text?: string; aantal: number; children: ReactNode }) {
  return text && aantal ? children : null;
}

// Kopkaart is alleen schermvullend op Home of met tabsamenvatting; anders compact (#150).
export const kopKompact = (alles: boolean, text?: string, aantal = 0) => !alles && !(text && aantal);
