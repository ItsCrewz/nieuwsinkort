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
