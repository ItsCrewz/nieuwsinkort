// Terugvegen in een artikel (links → rechts, zoals op social media): pure gebaarlogica + hook die de pagina de vinger laat volgen.
import { useLayoutEffect, useRef } from "react";
import { rustig } from "./beweging";

export const RAND = 20; // px: linkerrand is van het iOS-terugvegen van Safari
export const START = 10; // px: pas daarna beslissen we wat het gebaar is
export const RATIO = 1.5; // |dx| moet zoveel groter zijn dan |dy|
export const DREMPEL = 0.3; // aandeel van de breedte om te sluiten
export const FLICK = 0.5; // px/ms
export const FLICK_MIN = 40; // px: een flick moet ook echt een eind opschuiven
export const VENSTER = 100; // ms: de flicksnelheid telt alleen de laatste beweging voor loslaten

export type Besluit = "wacht" | "veeg" | "nee";

// Mag een aanraking op x een veeg worden? Nee dicht bij de linkerrand.
export const magStarten = (x: number) => x >= RAND;

// Eerste duidelijke beweging bepaalt het gebaar; verticaal of naar links = nooit een veeg.
export function besluit(dx: number, dy: number): Besluit {
  const ax = Math.abs(dx), ay = Math.abs(dy);
  if (Math.max(ax, ay) <= START) return "wacht";
  return dx > START && dx > ay * RATIO ? "veeg" : "nee";
}

export type Punt = { dx: number; t: number };

// Snelheid over het laatste venster voor loslaten (zodat vasthouden of langzaam slepen eerder niet meetelt); geen punt in het venster = vinger stond stil.
export function recenteSnelheid(punten: Punt[], nu: number): { dx: number; ms: number } | undefined {
  const i = punten.findIndex((p) => p.t >= nu - VENSTER);
  const laatste = punten[punten.length - 1];
  if (i < 0 || !laatste) return undefined;
  const basis = punten[i < punten.length - 1 ? i : Math.max(0, i - 1)]; // eerste punt in het venster; bij één punt het vorige
  const ms = laatste.t - basis.t;
  return ms > 0 ? { dx: laatste.dx - basis.dx, ms } : undefined;
}

// Sluiten bij ≥30% van de breedte of een snelle flick naar rechts; `recent` (laatste beweging) vervangt de gemiddelde snelheid.
export function sluit(dx: number, breedte: number, ms: number, recent?: { dx: number; ms: number }): boolean {
  if (dx <= 0 || breedte <= 0) return false;
  if (dx >= breedte * DREMPEL) return true;
  if (dx < FLICK_MIN) return false;
  return recent ? recent.ms > 0 && recent.dx / recent.ms >= FLICK : ms > 0 && dx / ms >= FLICK;
}

// Zichtbare breedte van het artikel (translateX verandert die niet); terugval op venster bij nul, NaN of ontbrekende afmetingen; nooit breder dan het venster.
export function veegBreedte(artikel: Element | null, venster: number): number {
  const ok = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;
  const e = artikel as (Element & { offsetWidth?: number }) | null;
  const b = [e?.getBoundingClientRect?.().width, e?.clientWidth, e?.offsetWidth].find(ok);
  return b === undefined ? venster : ok(venster) ? Math.min(b, venster) : b;
}

// translateX waarmee het artikel helemaal buiten de rechterrand staat; `left` is de huidige rect.left (incl. de al toegepaste `dx`). Ongeldige invoer: alleen de eigen breedte.
export function eindAfstand(breed: number, venster: number, left?: number, dx = 0): number {
  if (typeof left !== "number" || !Number.isFinite(left) || !Number.isFinite(venster) || venster <= 0) return breed;
  return Math.max(breed, venster - (left - Math.max(0, dx)));
}

const ROLLEN = ["button", "checkbox", "switch", "tab", "menuitem", "menuitemcheckbox", "menuitemradio", "radio", "slider", "spinbutton", "scrollbar", "combobox", "option", "treeitem"];
export const NEGEER = ["video", "iframe", "embed", "object", "audio", "input", "textarea", "select", "button", "summary", "[contenteditable]", "[data-geen-veeg]", ...ROLLEN.map((r) => `[role="${r}"]`), '[tabindex]:not([tabindex="-1"])'].join(",");

// Video, embeds, invoer, knoppen, aangepaste bediening (ARIA-rol of focusbaar via tabindex) en horizontaal scrollbare elementen (binnen het artikel) blijven van zichzelf.
export function negeerDoel(el: Element | null, grens: Element | null = null): boolean {
  for (let e = el; e && e !== grens; e = e.parentElement) {
    if (e.matches(NEGEER)) return true;
    if (e.scrollWidth > e.clientWidth + 1 && /^(auto|scroll)$/.test(getComputedStyle(e).overflowX)) return true;
  }
  return false;
}

export function magStartenOp(artikel: Element | null, doel: Element | null): boolean {
  return !!artikel && !!doel && artikel.contains(doel) && !negeerDoel(doel, artikel.parentElement);
}

const selectie = () => { const s = window.getSelection?.(); return !!s && !s.isCollapsed && s.toString().length > 0; };

// Pagina volgt de vinger; los te vroeg = terugveren, anders onBack (history.back via de bestaande sluitroute).
export function useTerugvegen(ref: { current: HTMLElement | null }, onBack: (opties?: { geveegd?: boolean }) => void) {
  const terug = useRef(onBack);
  terug.current = onBack;
  useLayoutEffect(() => luisterTerugvegen(ref, terug), [ref]);
}

export function luisterTerugvegen(ref: { current: HTMLElement | null }, terug: { current: (opties?: { geveegd?: boolean }) => void }) {
    let x0 = 0, y0 = 0, t0 = 0, dx = 0, punten: Punt[] = [], stand: "uit" | "wacht" | "veeg" | "sluit" = "uit";
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
      if (stand === "sluit") return; // bevestigde veeg: de sluiting loopt af, een nieuwe aanraking breekt die niet af
      if (stand === "veeg") klaar(); // tweede vinger tijdens een veeg
      else if (timer !== undefined) klaar(); // nieuw gebaar tijdens terugveren: annuleert (#658) en herstelt eerst
      stand = "uit";
      const t = ev.touches[0];
      if (ev.touches.length !== 1 || !t || !magStarten(t.clientX) || selectie()) return;
      const artikel = el();
      if (!magStartenOp(artikel, typeof Element !== "undefined" && ev.target instanceof Element ? ev.target : null)) return;
      x0 = t.clientX; y0 = t.clientY; t0 = ev.timeStamp; dx = 0; punten = [{ dx: 0, t: t0 }]; stand = "wacht";
    };
    const beweeg = (ev: TouchEvent) => {
      if (stand === "uit" || stand === "sluit") return;
      const t = ev.touches[0];
      if (!t || ev.touches.length !== 1 || selectie()) { if (stand === "veeg") klaar(); stand = "uit"; return; }
      dx = t.clientX - x0;
      punten.push({ dx, t: ev.timeStamp });
      if (punten.length > 12) punten.shift();
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
      const breed = veegBreedte(el(), window.innerWidth);
      if (ev.type !== "touchcancel" && !selectie() && sluit(dx, breed, ev.timeStamp - t0, recenteSnelheid(punten, ev.timeStamp))) {
        if (rustig()) { klaar(); terug.current({ geveegd: true }); return; }
        stand = "sluit";
        zet(eindAfstand(breed, window.innerWidth, el()?.getBoundingClientRect?.().left, dx), true);
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
}
