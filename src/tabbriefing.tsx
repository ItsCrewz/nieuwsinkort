import type { ReactNode } from "react";

export function TabBriefing({ text, aantal, children }: { text?: string; aantal: number; children: ReactNode }) {
  return text && aantal ? children : null;
}

// Alleen de kopkaart op Home is schermvullend (#150).
export const kopKompact = (alles: boolean) => !alles;
