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

// Een keuze uit een ander tabblad (storage-event op localStorage) overschrijft het eigen geheugen, zodat
// een oude voorkeur niet blijft hangen. Het "getikt"-gebaar blijft per document: zonder eigen tik blijft dit tabblad gedempt.
export function volgGeluid(cb: (aan: boolean) => void): () => void {
  const luister = (e: StorageEvent) => {
    if (e.key !== SLEUTEL || (e.newValue !== "0" && e.newValue !== "1")) return;
    const aan = e.newValue === "1";
    geheugen = aan;
    try { window.sessionStorage.setItem(SLEUTEL, e.newValue); } catch { /* opslag geblokkeerd */ }
    cb(aan);
  };
  try { window.addEventListener("storage", luister); } catch { return () => {}; }
  return () => { try { window.removeEventListener("storage", luister); } catch { /* weg */ } };
}

// "Getikt" geldt per document: een herladen tab start gedempt (verse, vergrendelde elementen) tot de eerste tik.
let tikGeheugen = false;
export function geluidTik(): boolean { return tikGeheugen; }
export function onthoudGeluidTik(): void { tikGeheugen = true; }
