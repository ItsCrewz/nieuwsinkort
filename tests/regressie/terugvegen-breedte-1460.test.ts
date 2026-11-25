import assert from "node:assert/strict";
import { luisterTerugvegen } from "../../src/terugvegen";

const handlers = new Map<string, (ev: TouchEvent) => void>();
const win = new Map<string, () => void>();
const klassen = new Set<string>();
class ElementStub {}
const artikel = Object.assign(new ElementStub(), {
  style: { transition: "", transform: "" },
  classList: { add: (n: string) => klassen.add(n), remove: (n: string) => klassen.delete(n) },
  parentElement: null, scrollWidth: 0, clientWidth: 0, matches: () => false, contains: () => true,
});
const body = { style: { overflowX: "scroll" } };
let rustig = false, navigaties = 0;
const window = {
  innerWidth: 300, getSelection: () => ({ isCollapsed: true, toString: () => "" }), matchMedia: () => ({ matches: rustig }),
  addEventListener: (t: string, fn: () => void) => win.set(t, fn), removeEventListener: (t: string) => win.delete(t),
};
Object.assign(globalThis, {
  Element: ElementStub, window,
  document: { body, addEventListener: (t: string, fn: (ev: TouchEvent) => void) => handlers.set(t, fn), removeEventListener: (t: string) => handlers.delete(t) },
});
const stuur = (type: string, punten: number[]) => handlers.get(type)?.({
  type, timeStamp: 100, touches: punten.map((clientX) => ({ clientX, clientY: 0 })), target: artikel, cancelable: true, preventDefault() {},
} as unknown as TouchEvent);
const schoon = () => {
  assert.equal(artikel.style.transform, "");
  assert.equal(artikel.style.transition, "");
  assert.equal(klassen.has("veegt"), false);
  assert.equal(body.style.overflowX, "scroll");
};
const ruimOp = luisterTerugvegen({ current: artikel as unknown as HTMLElement }, { current: () => { navigaties++; } });
assert.equal(win.size, 2);

// met resize-event, loslaten ver over de drempel van de nieuwe breedte
for (const rust of [true, false]) {
  rustig = rust;
  window.innerWidth = 300;
  stuur("touchstart", [30]); stuur("touchmove", [200]);
  assert.equal(klassen.has("veegt"), true);
  window.innerWidth = 600; win.get("resize")?.();
  if (rust) schoon();
  stuur("touchend", [200]);
  await new Promise((r) => setTimeout(r, 260));
  schoon(); assert.equal(navigaties, 0);
}
rustig = true;

// zonder event: vangnet bij loslaten
window.innerWidth = 300;
stuur("touchstart", [30]); stuur("touchmove", [250]);
window.innerWidth = 320;
stuur("touchend", [250]);
schoon(); assert.equal(navigaties, 0);

// cleanup tijdens een veeg
window.innerWidth = 320;
stuur("touchstart", [30]); stuur("touchmove", [200]);
assert.equal(klassen.has("veegt"), true);
const ruim2 = ruimOp;
ruim2();
schoon(); assert.equal(win.size, 0); assert.equal(handlers.size, 0);

// latere veeg zonder maatwijziging sluit normaal
const ruimOp2 = luisterTerugvegen({ current: artikel as unknown as HTMLElement }, { current: () => { navigaties++; } });
stuur("touchstart", [30]); stuur("touchmove", [250]); stuur("touchend", [250]);
assert.equal(navigaties, 1);
ruimOp2();
console.log("✓ terugvegen herstelt het artikel bij maatwijziging tijdens een veeg (#1460)");
