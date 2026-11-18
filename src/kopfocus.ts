// Focus op de artikelkop bij openen van een ander artikel; Escape = terug met de actuele callback.
// Een verversing van hetzelfde artikel (nieuw item-object, zelfde sleutel) verplaatst de focus niet (#1207).
import { useEffect, useRef } from "react";

export function useKopFocus(kopRef: { current: HTMLElement | null }, sleutel: string, onBack: () => void) {
  const terug = useRef(onBack);
  terug.current = onBack;
  useEffect(() => {
    kopRef.current?.focus({ preventScroll: true });
  }, [kopRef, sleutel]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && terug.current();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
}
