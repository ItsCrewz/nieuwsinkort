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
export function leesFocusKeuze(storage?: FocusStorage | null, sessie?: FocusStorage | null): boolean {
  try {
    const keuze = sessie?.getItem(FOCUS_KEY);
    if (keuze === "aan" || keuze === "uit") return keuze === "aan";
  } catch { /* probeer blijvende opslag */ }
  try {
    return storage?.getItem(FOCUS_KEY) === "aan";
  } catch {
    return false;
  }
}

export function bewaarFocusKeuze(storage: FocusStorage | null | undefined, aan: boolean, sessie?: FocusStorage | null): void {
  try {
    if (!storage) throw new Error("Geen opslag");
    storage.setItem(FOCUS_KEY, aan ? "aan" : "uit");
  } catch {
    try { sessie?.setItem(FOCUS_KEY, aan ? "aan" : "uit"); } catch { /* alleen componentstate */ }
    return;
  }
  try { sessie?.removeItem(FOCUS_KEY); } catch { /* negeer */ }
  ruimOudeFocusKeuzeOp(storage);
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

export function browserSessieStorage(): FocusStorage | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
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
    if (e.key !== null && e.key !== FOCUS_KEY) return;
    try { browserSessieStorage()?.removeItem(FOCUS_KEY); } catch { /* negeer */ }
    cb(e.newValue === "aan");
  };
  try { window.addEventListener("storage", luister); } catch { return () => {}; }
  return () => { try { window.removeEventListener("storage", luister); } catch { /* weg */ } };
}
