// Beweging: duren (gelijk aan de CSS-tokens in index.css) en de enige prefers-reduced-motion-check in JS.
export const DUUR = { 1: 120, 2: 180, 3: 240, 4: 320 } as const; // ms, = --dur-1..4
export type Overgang = "open" | "terug" | "wissel" | "thema";

/** Reduced motion aan? Zonder matchMedia: gewoon animeren. */
export const rustig = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Gedrag voor scrollTo/scrollIntoView. */
export const scrollGedrag = (): ScrollBehavior => (rustig() ? "auto" : "smooth");

const lopend = new WeakMap<Element, Animation>();

/** WAAPI-animatie (alleen transform/opacity meegeven). No-op bij reduced motion, zonder el.animate of in een verborgen tab; annuleert een lopende animatie op hetzelfde element. */
export function animeer(el: Element, frames: Keyframe[] | PropertyIndexedKeyframes, opt: KeyframeAnimationOptions = {}): Animation | null {
  if (rustig() || typeof el.animate !== "function" || (typeof document !== "undefined" && document.hidden)) return null;
  lopend.get(el)?.cancel();
  const a = el.animate(frames, { duration: DUUR[3], easing: "cubic-bezier(.05,.7,.1,1)", ...opt });
  lopend.set(el, a);
  const klaar = () => { if (lopend.get(el) === a) lopend.delete(el); };
  a.addEventListener("finish", klaar);
  a.addEventListener("cancel", klaar);
  return a;
}

import type { Route } from "./route";

type VT = { startViewTransition?: (cb: () => void | Promise<void>) => { finished: Promise<unknown> } };

export function kanOvergang(van?: Route | null, naar?: Route, veeg = false): boolean {
  if (arguments.length && (!van || !naar || veeg || [van.view, naar.view].some((v) => v === "filmpjes" || v === "dumpert") || !!van.selected === !!naar.selected)) return false;
  const d = typeof document !== "undefined" ? (document as unknown as VT & Document) : null;
  return !!d && !d.hidden && !rustig() && typeof d.startViewTransition === "function" && !d.querySelector?.(".sheet-root,.menu,[role=dialog]");
}

/** Voert update uit, met een View Transition als de browser die kent en reduced motion uit staat (anders direct). `soort` komt als data-overgang op <html> voor de ::view-transition-regels. */
export async function metOvergang(update: () => void | Promise<void>, soort: Overgang = "wissel"): Promise<void> {
  const d = typeof document !== "undefined" ? (document as unknown as VT & Document) : null;
  if (!d || !kanOvergang() || !d.startViewTransition) { await update(); return; }
  const root = d.documentElement;
  root.dataset.overgang = soort;
  try { await d.startViewTransition(update).finished; }
  catch { /* overgang afgebroken: de update is dan al gedaan of gaat door */ }
  finally { delete root.dataset.overgang; }
}
