import assert from "node:assert/strict";
import { luisterTerugvegen } from "../../src/terugvegen";

const handlers = new Map<string, (ev: TouchEvent) => void>();
const klassen = new Set<string>();
class ElementStub {}
const artikel = Object.assign(new ElementStub(), {
  style: { transition: "", transform: "" },
  classList: { add: (naam: string) => klassen.add(naam), remove: (naam: string) => klassen.delete(naam) },
  parentElement: null, scrollWidth: 0, clientWidth: 0, matches: () => false, contains: () => true,
});
const body = { style: { overflowX: "scroll" } };
let selectie = false, navigaties = 0;
Object.assign(globalThis, {
  Element: ElementStub,
  document: { body, addEventListener: (type: string, fn: (ev: TouchEvent) => void) => handlers.set(type, fn), removeEventListener: (type: string) => handlers.delete(type) },
  window: { innerWidth: 300, getSelection: () => ({ isCollapsed: !selectie, toString: () => "tekst" }), matchMedia: () => ({ matches: false }) },
});
const stuur = (type: string, punten: number[]) => handlers.get(type)?.({
  type, timeStamp: 100, touches: punten.map((clientX) => ({ clientX, clientY: 0 })), target: artikel, cancelable: true, preventDefault() {},
} as unknown as TouchEvent);
const ruimOp = luisterTerugvegen({ current: artikel as unknown as HTMLElement }, { current: () => { navigaties++; } });
for (const onderbreking of ["vinger", "beweging", "selectie"]) {
  stuur("touchstart", [30]);
  stuur("touchmove", [200]);
  assert.equal(klassen.has("veegt"), true);
  if (onderbreking === "vinger") stuur("touchstart", [200, 220]);
  if (onderbreking === "beweging") stuur("touchmove", [200, 220]);
  if (onderbreking === "selectie") { selectie = true; stuur("touchmove", [200]); }
  stuur("touchend", [200]);
  stuur("touchend", []);
  assert.equal(artikel.style.transform, "");
  assert.equal(artikel.style.transition, "");
  assert.equal(klassen.has("veegt"), false);
  assert.equal(body.style.overflowX, "scroll");
  assert.equal(navigaties, 0);
  selectie = false;
}
ruimOp();
console.log("✓ onderbroken terugveeg herstelt het artikel direct (#1026)");
