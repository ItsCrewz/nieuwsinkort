import type { ReactNode } from "react";

export function TabBriefing({ text, aantal, children }: { text?: string; aantal: number; children: ReactNode }) {
  return text && aantal ? children : null;
}
