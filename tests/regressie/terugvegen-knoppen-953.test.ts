// Regressie #953: een gebaar dat op een knop of ARIA-bediening begint start geen terugveeg; gewone tekst en de h1 (tabindex -1) wel.
import assert from "node:assert/strict";
import { NEGEER, magStartenOp, luisterTerugvegen } from "../../src/terugvegen";

// Minimale selectormatcher voor de eenvoudige selectors in NEGEER (tag, [attr], [attr="w"], [tabindex]:not([tabindex="-1"])).
type Spec = { tag: string; attrs?: Record<string, string> };
function el(spec: Spec, ouder: Element | null): Element {
  const a = spec.attrs || {};
  const eenvoud = (s: string) => {
    if (s === '[tabindex]:not([tabindex="-1"])') return "tabindex" in a && a.tabindex !== "-1";
    const m = /^\[([\w-]+)(?:="([^"]*)")?\]$/.exec(s);
    if (m) return m[1] in a && (m[2] === undefined || a[m[1]] === m[2]);
    return s === spec.tag;
  };
  return {
    parentElement: ouder, scrollWidth: 0, clientWidth: 0,
    matches: (sel: string) => sel.split(/,(?![^\[]*\])/).some(eenvoud),
    contains(d: Element) { for (let e: Element | null = d; e; e = e.parentElement) if (e === this) return true; return false; },
  } as unknown as Element;
}
(globalThis as any).getComputedStyle = () => ({ overflowX: "visible" });

const shell = el({ tag: "div" }, null);
const artikel = el({ tag: "article" }, shell);
const wrap = (s: Spec) => el(s, el({ tag: "div" }, artikel));
const tekst = wrap({ tag: "p" });
const h1 = wrap({ tag: "h1", attrs: { tabindex: "-1" } });
const knop = wrap({ tag: "button" });
const knopKind = el({ tag: "span" }, knop);
const rol = wrap({ tag: "div", attrs: { role: "switch", tabindex: "0" } });
const focus = wrap({ tag: "div", attrs: { tabindex: "0" } });
const slider = wrap({ tag: "div", attrs: { role: "slider" } });
assert.ok(NEGEER.includes("button"));
assert.equal(magStartenOp(artikel, tekst), true);
assert.equal(magStartenOp(artikel, h1), true);
for (const d of [knop, knopKind, rol, focus, slider]) assert.equal(magStartenOp(artikel, d), false);

// Aanraakevents: op een knop geen veeg (en geen preventDefault); op tekst wel, inclusief annuleren en reduced motion.
const g = globalThis as any;
let rustig = false;
g.window = { innerWidth: 400, matchMedia: () => ({ matches: rustig }), getSelection: () => ({ isCollapsed: true, toString: () => "" }) };
g.Element = class {};
const handlers = new Map<string, (ev: any) => void>();
g.document = { body: { style: { overflowX: "" } }, addEventListener: (n: string, f: any) => handlers.set(n, f), removeEventListener: (n: string) => handlers.delete(n) };
const raak = (type: string, doel: unknown, x: number, ts = 0) => {
  let geblokkeerd = false;
  handlers.get(type)!({ type, touches: type === "touchend" ? [] : [{ clientX: x, clientY: 100 }], target: doel, timeStamp: ts, cancelable: true, preventDefault: () => { geblokkeerd = true; } });
  return geblokkeerd;
};
class Doel {} // instanceof Element in de hook
g.Element = Doel;
const echt = (spec: Spec, ouder: Element | null) => Object.assign(new Doel(), el(spec, ouder));
const eart = echt({ tag: "article" }, null);
const etekst = echt({ tag: "p" }, eart), eknop = echt({ tag: "button" }, eart), erol = echt({ tag: "span", attrs: { role: "tab" } }, eart);
const mk = (terug: () => void) => {
  const a = { style: { transform: "", transition: "" }, classList: { add() {}, remove() {} }, parentElement: null, contains: (d: unknown) => d === etekst || d === eknop || d === erol } as any;
  return { a, stop: luisterTerugvegen({ current: a }, { current: terug }) };
};

for (const d of [eknop, erol]) {
  let n = 0; const h = mk(() => n++);
  raak("touchstart", d, 100);
  assert.equal(raak("touchmove", d, 250, 10), false);
  assert.equal(h.a.style.transform, "");
  raak("touchend", d, 250, 20);
  assert.equal(n, 0);
  h.stop();
}
{ // tekst: veeg sluit (reduced motion: direct)
  rustig = true; let n = 0; const h = mk(() => n++);
  raak("touchstart", etekst, 100);
  assert.equal(raak("touchmove", etekst, 300, 10), true);
  raak("touchend", etekst, 300, 20);
  assert.equal(n, 1);
  h.stop(); rustig = false;
}
{ // annuleren: touchcancel sluit niet
  rustig = true; let n = 0; const h = mk(() => n++);
  raak("touchstart", etekst, 100);
  raak("touchmove", etekst, 300, 10);
  raak("touchcancel", etekst, 300, 20);
  assert.equal(n, 0); assert.equal(h.a.style.transform, "");
  h.stop(); rustig = false;
}
console.log("✓ terugvegen laat knoppen en ARIA-bediening hun eigen gebaar (#953)");
