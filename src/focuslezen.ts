// Focus lezen (bionic): standaard uit; alleen een expliciete keuze van de gebruiker wordt bewaard.
// Nieuwe sleutel: de oude (…-v2) werd historisch alleen bij een klik geschreven, maar telt niet meer mee
// en wordt opgeruimd, zodat een mogelijke oude standaard nooit als keuze geldt.
export const FOCUS_KEY = "nieuwsinkort-focus-lezen-keuze";
const OUDE_KEY = "dagelijks-nieuws-focus-lezen-v2";

export interface FocusStorage {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

// Zonder storage, bij een fout of zonder expliciete keuze: uit.
export function leesFocusKeuze(storage?: FocusStorage | null): boolean {
  try {
    return storage?.getItem(FOCUS_KEY) === "aan";
  } catch {
    return false;
  }
}

export function bewaarFocusKeuze(storage: FocusStorage | null | undefined, aan: boolean): void {
  try {
    storage?.setItem(FOCUS_KEY, aan ? "aan" : "uit");
    storage?.removeItem(OUDE_KEY);
  } catch {
    /* privémodus: keuze geldt alleen voor deze sessie */
  }
}

export function ruimOudeFocusKeuzeOp(storage?: FocusStorage | null): void {
  try {
    storage?.removeItem(OUDE_KEY);
  } catch {
    /* negeer */
  }
}

// localStorage kan ontbreken of bij het benaderen al gooien.
export function browserStorage(): FocusStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

// Wijziging uit een ander tabblad volgen (storage-event). Schrijft zelf nooit terug: geen echo of lus.
// Verwijderde keuze (key === null bij clear(), of newValue null) → standaard uit.
export function volgFocusKeuze(cb: (aan: boolean) => void): () => void {
  const luister = (e: StorageEvent) => {
    try {
      // Alleen localStorage telt (geen sessionStorage-event).
      if (e.storageArea && e.storageArea !== window.localStorage) return;
    } catch { return; }
    if (e.key === null) return cb(false);
    if (e.key !== FOCUS_KEY) return;
    cb(e.newValue === "aan");
  };
  try { window.addEventListener("storage", luister); } catch { return () => {}; }
  return () => { try { window.removeEventListener("storage", luister); } catch { /* weg */ } };
}
