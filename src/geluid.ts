const SLEUTEL = "nieuwsinkort-geluid";
let geheugen: boolean | undefined;

// Sessie gaat voor, zodat een mislukte localStorage-write de keuze niet terugdraait.
export function soundOn(): boolean {
  if (geheugen !== undefined) return geheugen;
  for (const opslag of ["sessionStorage", "localStorage"] as const) {
    try {
      const waarde = window[opslag].getItem(SLEUTEL);
      if (waarde === "1" || waarde === "0") return waarde === "1";
    } catch { /* opslag geblokkeerd */ }
  }
  return geheugen ?? true;
}

export function saveSound(aan: boolean): void {
  geheugen = aan;
  for (const opslag of ["sessionStorage", "localStorage"] as const) {
    try {
      window[opslag].setItem(SLEUTEL, aan ? "1" : "0");
    } catch { /* opslag geblokkeerd */ }
  }
}

const TIK_SLEUTEL = "nieuwsinkort-geluid-tik";
let tikGeheugen = false;
export function geluidTik(): boolean {
  try { return tikGeheugen || sessionStorage.getItem(TIK_SLEUTEL) === "1"; } catch { return tikGeheugen; }
}
export function onthoudGeluidTik(): void {
  tikGeheugen = true;
  try { sessionStorage.setItem(TIK_SLEUTEL, "1"); } catch { /* opslag geblokkeerd */ }
}
