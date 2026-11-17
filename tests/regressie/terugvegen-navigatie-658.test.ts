import assert from "node:assert/strict";
import { luisterTerugvegen } from "../../src/terugvegen";

const handlers = new Map<string, (ev: TouchEvent) => void>();
class FakeElement {}
const element = Object.assign(new FakeElement(), {
  style: { transition: "", transform: "" }, classList: { add() {}, remove() {} }, parentElement: null,
  scrollWidth: 0, clientWidth: 0, matches: () => false, contains: () => true,
});
let reduced = false;
Object.assign(globalThis, {
  Element: FakeElement,
  document: {
    body: { style: { overflowX: "" } },
    addEventListener: (type: string, fn: (ev: TouchEvent) => void) => handlers.set(type, fn),
    removeEventListener: (type: string) => handlers.delete(type),
  },
  window: { innerWidth: 300, getSelection: () => null, matchMedia: () => ({ matches: reduced }) },
});
const stuur = (type: string, x: number, timeStamp: number) => handlers.get(type)?.({
  type, timeStamp, touches: type === "touchend" || type === "touchcancel" ? [] : [{ clientX: x, clientY: 0 }],
  target: element, cancelable: true, preventDefault() {},
} as unknown as TouchEvent);
const veeg = (afstand = 120) => { stuur("touchstart", 30, 0); stuur("touchmove", 30 + afstand, 100); stuur("touchend", 30 + afstand, 150); };
const wacht = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
let sluitingen = 0;
const open = () => luisterTerugvegen({ current: element as unknown as HTMLElement }, { current: () => { sluitingen++; } });

let ruimOp = open();
veeg();
ruimOp(); // Direct navigeren en een nieuw artikel openen.
ruimOp = open();
await wacht(220);
assert.equal(sluitingen, 0, "oude veeg sluit het nieuwe artikel niet");
veeg();
await wacht(220);
assert.equal(sluitingen, 1, "voltooide veeg sluit precies eenmaal");
veeg();
stuur("touchstart", 30, 200);
stuur("touchcancel", 30, 210);
await wacht(220);
assert.equal(sluitingen, 2, "bevestigde veeg sluit precies eenmaal, ook na een nieuwe aanraking");
veeg(20);
await wacht(220);
assert.equal(sluitingen, 2, "terugveren sluit niet");
assert.equal(element.style.transform, "");
veeg(20);
stuur("touchstart", 30, 300); // nieuwe aanraking tijdens terugveren annuleert het terugveren
stuur("touchcancel", 30, 310);
await wacht(220);
assert.equal(sluitingen, 2, "geannuleerd terugveren sluit niet");
veeg();
ruimOp(); // unmount tijdens de sluit-animatie
await wacht(220);
assert.equal(sluitingen, 2, "unmount veroorzaakt geen late navigatie");
ruimOp = open();
reduced = true;
veeg();
assert.equal(sluitingen, 3, "reduced motion sluit direct");
stuur("touchstart", 30, 400);
assert.equal(sluitingen, 3, "reduced motion sluit niet dubbel");
ruimOp();
console.log("✓ uitgestelde terugveeg blijft bij het oorspronkelijke artikel (#658)");
