// Invoertype: touch (swipe-feed voor Filmpjes en Dumpert) of muis/trackpad (gewone weergave met kopjes).
// Beslist op het primaire invoerapparaat, niet op schermbreedte: een smal desktopvenster blijft desktop.
export const TOUCH_QUERIES = ["(pointer: coarse)", "(hover: none)"] as const;

type MM = (q: string) => { matches: boolean } | null | undefined;

/** Touch als het primaire aanwijsapparaat grof is of hover ontbreekt. Zonder matchMedia: desktop. */
export function isTouch(mm: MM | undefined | null): boolean {
  if (!mm) return false;
  return TOUCH_QUERIES.some((q) => !!mm(q)?.matches);
}

/** Abonneert op wijzigingen van de mediaqueries; geeft de afmelder terug. */
export function volgTouch(mm: ((q: string) => MediaQueryList) | undefined | null, cb: (touch: boolean) => void): () => void {
  if (!mm) return () => {};
  const lijst = TOUCH_QUERIES.map((q) => mm(q));
  const naar = () => cb(isTouch(mm));
  lijst.forEach((l) => l.addEventListener?.("change", naar));
  return () => lijst.forEach((l) => l.removeEventListener?.("change", naar));
}

export const touchNu = () => isTouch(typeof window !== "undefined" ? window.matchMedia?.bind(window) : null);
