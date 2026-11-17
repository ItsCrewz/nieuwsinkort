import { useEffect, useRef, useState, type RefObject } from "react";
import { rustig } from "./beweging";

export const TREK_DREMPEL = 56;
export const TREK_REM = 30_000;
export const trekAfstand = (dy: number) => Math.min(Math.max(0, dy) * 0.5, 72);
export const magVerversen = (afstand: number, nu: number, laatst: number) => afstand >= TREK_DREMPEL && nu - laatst >= TREK_REM;

export function useTrekverversen(ref: RefObject<HTMLElement>, actief: boolean, ververs: () => Promise<boolean | undefined>, laatst: { current: number }) {
  const [afstand, setAfstand] = useState(0);
  const [status, setStatus] = useState("");
  const [trekt, setTrekt] = useState(false);
  const bezig = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || !actief) return;
    let start: { x: number; y: number } | null = null;
    let afstandNu = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let geldig = true;
    const begin = (e: TouchEvent) => {
      if (bezig.current || e.touches.length !== 1 || el.scrollTop !== 0) return;
      start = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      afstandNu = 0;
    };
    const beweeg = (e: TouchEvent) => {
      if (!start || e.touches.length !== 1) return;
      const dx = e.touches[0].clientX - start.x;
      const dy = e.touches[0].clientY - start.y;
      if (dy < 0 || Math.abs(dx) > Math.abs(dy) || el.scrollTop !== 0) { start = null; setAfstand(0); setTrekt(false); return; }
      afstandNu = trekAfstand(dy);
      setTrekt(true);
      setAfstand(afstandNu);
    };
    const einde = async (e: TouchEvent) => {
      if (!start) return;
      start = null;
      setTrekt(false);
      if (e.type === "touchcancel" || afstandNu < TREK_DREMPEL) { setAfstand(0); return; }
      bezig.current = true;
      setAfstand(TREK_DREMPEL);
      let tekst = "Je bent bij";
      if (magVerversen(afstandNu, Date.now(), laatst.current)) {
        laatst.current = Date.now();
        const nieuw = await ververs();
        if (!geldig) return;
        if (nieuw === undefined) { bezig.current = false; setAfstand(0); return; }
        if (nieuw) tekst = `Bijgewerkt om ${new Intl.DateTimeFormat("nl-NL", { timeZone: "Europe/Amsterdam", hour: "2-digit", minute: "2-digit" }).format(new Date())}`;
      }
      setStatus(tekst);
      timer = setTimeout(() => { setStatus(""); setAfstand(0); bezig.current = false; }, 1200);
    };
    el.addEventListener("touchstart", begin, { passive: true });
    el.addEventListener("touchmove", beweeg, { passive: true });
    el.addEventListener("touchend", einde, { passive: true });
    el.addEventListener("touchcancel", einde, { passive: true });
    return () => {
      geldig = false;
      clearTimeout(timer);
      bezig.current = false;
      el.removeEventListener("touchstart", begin);
      el.removeEventListener("touchmove", beweeg);
      el.removeEventListener("touchend", einde);
      el.removeEventListener("touchcancel", einde);
    };
  }, [ref, actief, ververs, laatst]);
  return { afstand, status, trekt, verminderd: rustig() };
}
