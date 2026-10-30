// Buffergrenzen voor de actieve en volgende speler in de videofeed.
export type Niveau = "ruim" | "zuinig" | "minimaal";
export type Netwerk = { saveData?: boolean; effectiveType?: string; type?: string } | null | undefined;

export function niveauVan(c: Netwerk): Niveau {
  if (c?.saveData || /(^|-)2g$/.test(c?.effectiveType || "")) return "minimaal";
  if (c?.type === "cellular" || c?.effectiveType === "3g") return "zuinig";
  return "ruim";
}

// hls.js gebruikt seconden en bytes als richtgrenzen; hele segmenten kunnen die overschrijden.
export function planVoor(afstand: number, niveau: Niveau): { secs: number; bytes: number } {
  if (afstand === 0) return { secs: 30, bytes: 60e6 };
  if (afstand === 1) return {
    ruim: { secs: 4, bytes: 1e6 },
    zuinig: { secs: 2, bytes: 1e6 },
    minimaal: { secs: 0, bytes: 0 },
  }[niveau];
  return { secs: 0, bytes: 0 };
}
