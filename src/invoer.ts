// Invoertype: touch (swipe-feed voor Filmpjes en Dumpert) of muis/trackpad (gewone weergave met kopjes).
// Alleen een grof primair aanwijsapparaat telt: "hover: none" alleen is ook waar zonder pointer (toetsenbord).
// Beslist op het primaire invoerapparaat, niet op schermbreedte: een smal desktopvenster blijft desktop.
export const TOUCH_QUERIES = ["(pointer: coarse)"] as const;

type MM = (q: string) => { matches: boolean } | null | undefined;

/** Touch als het primaire aanwijsapparaat grof is (pointer: none telt niet). Zonder matchMedia: desktop. */
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
