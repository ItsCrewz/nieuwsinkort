// Terugvegen in een artikel (links → rechts, zoals op social media): pure gebaarlogica + hook die de pagina de vinger laat volgen.
import { useLayoutEffect, useRef } from "react";
import { rustig } from "./beweging";

export const RAND = 20; // px: linkerrand is van het iOS-terugvegen van Safari
export const START = 10; // px: pas daarna beslissen we wat het gebaar is
export const RATIO = 1.5; // |dx| moet zoveel groter zijn dan |dy|
export const DREMPEL = 0.3; // aandeel van de breedte om te sluiten
export const FLICK = 0.5; // px/ms
export const FLICK_MIN = 40; // px: een flick moet ook echt een eind opschuiven

export type Besluit = "wacht" | "veeg" | "nee";

// Mag een aanraking op x een veeg worden? Nee dicht bij de linkerrand.
export const magStarten = (x: number) => x >= RAND;

// Eerste duidelijke beweging bepaalt het gebaar; verticaal of naar links = nooit een veeg.
export function besluit(dx: number, dy: number): Besluit {
  const ax = Math.abs(dx), ay = Math.abs(dy);
  if (Math.max(ax, ay) <= START) return "wacht";
  return dx > START && dx > ay * RATIO ? "veeg" : "nee";
}

// Sluiten bij ≥30% van de breedte of een snelle flick naar rechts.
export function sluit(dx: number, breedte: number, ms: number): boolean {
  if (dx <= 0 || breedte <= 0) return false;
  if (dx >= breedte * DREMPEL) return true;
  return dx >= FLICK_MIN && ms > 0 && dx / ms >= FLICK;
}

const NEGEER = "video,iframe,embed,object,audio,input,textarea,select,[contenteditable],[data-geen-veeg]";

// Video, embeds, invoer en horizontaal scrollbare elementen (binnen het artikel) blijven van zichzelf.
export function negeerDoel(el: Element | null, grens: Element | null = null): boolean {
  for (let e = el; e && e !== grens; e = e.parentElement) {
    if (e.matches(NEGEER)) return true;
    if (e.scrollWidth > e.clientWidth + 1 && /^(auto|scroll)$/.test(getComputedStyle(e).overflowX)) return true;
  }
  return false;
}

const selectie = () => { const s = window.getSelection?.(); return !!s && !s.isCollapsed && s.toString().length > 0; };

// Pagina volgt de vinger; los te vroeg = terugveren, anders onBack (history.back via de bestaande sluitroute).
export function useTerugvegen(ref: { current: HTMLElement | null }, onBack: (opties?: { geveegd?: boolean }) => void) {
  const terug = useRef(onBack);
  terug.current = onBack;
  useLayoutEffect(() => {
    let x0 = 0, y0 = 0, t0 = 0, dx = 0, stand: "uit" | "wacht" | "veeg" | "sluit" = "uit";
    let timer: ReturnType<typeof setTimeout> | undefined, overflowVoor: string | null = null;
    const el = () => ref.current;
    const zet = (x: number, anim: boolean, veer = false) => {
      const e = el();
      if (!e) return;
      e.style.transition = anim ? `transform var(--dur-2) var(${veer ? "--ease-veer" : "--ease-uit"})` : "none";
      e.style.transform = x ? `translateX(${x}px)` : "";
    };
    const wis = () => { if (timer !== undefined) { clearTimeout(timer); timer = undefined; } };
    // Herstelt stijl en de body-overflow van vóór het gebaar (niet blind ""), en breekt lopende timers af.
    const klaar = () => {
      wis();
      const e = el();
      if (e) { e.style.transition = ""; e.style.transform = ""; e.classList.remove("veegt"); }
      if (overflowVoor !== null) { document.body.style.overflowX = overflowVoor; overflowVoor = null; }
    };
    const plan = (fn: () => void, ms: number) => { wis(); timer = setTimeout(() => { timer = undefined; fn(); }, ms); };
    // Onderbroken veeg: artikel blijft open en veert terug (direct bij reduced motion).
    const veer = () => { if (rustig()) klaar(); else { zet(0, true, true); plan(klaar, 220); } };
    const start = (ev: TouchEvent) => {
      if (stand === "sluit") return; // sluitanimatie loopt: onBack volgt, niets meer opstarten
      if (stand === "veeg") veer(); // tweede vinger tijdens een veeg
      else if (timer !== undefined) klaar(); // nieuw gebaar tijdens het terugveren: eerst netjes terug naar af
      stand = "uit";
      const t = ev.touches[0];
      if (ev.touches.length !== 1 || !t || !magStarten(t.clientX) || selectie()) return;
      if (negeerDoel(ev.target as Element | null, el()?.parentElement ?? null)) return;
      x0 = t.clientX; y0 = t.clientY; t0 = ev.timeStamp; dx = 0; stand = "wacht";
    };
    const beweeg = (ev: TouchEvent) => {
      if (stand === "uit" || stand === "sluit") return;
      const t = ev.touches[0];
      if (!t || ev.touches.length !== 1 || selectie()) { if (stand === "veeg") veer(); stand = "uit"; return; }
      dx = t.clientX - x0;
      if (stand === "wacht") {
        const b = besluit(dx, t.clientY - y0);
        if (b === "wacht") return;
        if (b === "nee") { stand = "uit"; return; }
        stand = "veeg";
        if (overflowVoor === null) overflowVoor = document.body.style.overflowX;
        el()?.classList.add("veegt");
        document.body.style.overflowX = "hidden";
      }
      if (ev.cancelable) ev.preventDefault();
      zet(Math.max(0, dx), false);
    };
    const eind = (ev: TouchEvent) => {
      const was = stand;
      if (was === "sluit") return;
      stand = "uit";
      if (was !== "veeg") return;
      const breed = window.innerWidth;
      if (ev.type !== "touchcancel" && sluit(dx, breed, ev.timeStamp - t0)) {
        if (rustig()) { klaar(); terug.current({ geveegd: true }); return; }
        stand = "sluit";
        zet(breed, true);
        plan(() => { stand = "uit"; terug.current({ geveegd: true }); klaar(); }, 200);
      } else veer();
    };
    document.addEventListener("touchstart", start, { passive: true });
    document.addEventListener("touchmove", beweeg, { passive: false });
    document.addEventListener("touchend", eind, { passive: true });
    document.addEventListener("touchcancel", eind, { passive: true });
    return () => {
      document.removeEventListener("touchstart", start);
      document.removeEventListener("touchmove", beweeg);
      document.removeEventListener("touchend", eind);
      document.removeEventListener("touchcancel", eind);
      klaar(); // wist ook de timer: na unmount geen reset of onBack meer
    };
  }, [ref]);
}
