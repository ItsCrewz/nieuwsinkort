// Focus op de artikelkop bij openen van een ander artikel; Escape = terug met de actuele callback.
// Een verversing van hetzelfde artikel (nieuw item-object, zelfde sleutel) verplaatst de focus niet (#1207).
import { useEffect, useRef } from "react";

// Escape sluit het artikel niet tijdens IME-compositie (die annuleert dan alleen de compositie) en niet als een onderliggende bediening de toets al afhandelde.
export function escapeSluit(e: Pick<KeyboardEvent, "key" | "isComposing" | "keyCode" | "defaultPrevented">): boolean {
  return e.key === "Escape" && !e.isComposing && e.keyCode !== 229 && !e.defaultPrevented;
}

export function useKopFocus(kopRef: { current: HTMLElement | null }, sleutel: string, onBack: () => void) {
  const terug = useRef(onBack);
  terug.current = onBack;
  useEffect(() => {
    kopRef.current?.focus({ preventScroll: true });
  }, [kopRef, sleutel]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => escapeSluit(e) && terug.current();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
}
