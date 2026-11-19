// Regressie #1300: de bronlink en deelknop uit het artikel houden hun aanraakgebaar.
import assert from "node:assert/strict";
import { luisterTerugvegen } from "../../src/terugvegen";

class ElementDubbel {
  scrollWidth = 0; clientWidth = 0;
  constructor(public tag: string, public parentElement: ElementDubbel | null, public href = false) {}
  matches(selector: string) {
    return selector.split(",").some((s) => s === this.tag || (s === "a[href]" && this.tag === "a" && this.href));
  }
  contains(doel: ElementDubbel) {
    for (let e: ElementDubbel | null = doel; e; e = e.parentElement) if (e === this) return true;
    return false;
  }
}
const g = globalThis as any;
g.Element = ElementDubbel;
g.getComputedStyle = () => ({ overflowX: "visible" });
g.window = { innerWidth: 400, matchMedia: () => ({ matches: true }), getSelection: () => ({ isCollapsed: true }) };
const handlers = new Map<string, (ev: any) => void>();
g.document = { body: { style: { overflowX: "" } }, addEventListener: (n: string, f: any) => handlers.set(n, f), removeEventListener: (n: string) => handlers.delete(n) };
const artikel = Object.assign(new ElementDubbel("article", null), { style: { transform: "", transition: "" }, classList: { add() {}, remove() {} } });
// Structuur uit detail.tsx: bronlink en deelknop met daarbinnen een element.
const link = new ElementDubbel("a", artikel, true), knop = new ElementDubbel("button", artikel);
const doelen = [link, new ElementDubbel("span", link), knop, new ElementDubbel("span", knop)];
const tekst = new ElementDubbel("p", artikel);
let gesloten = 0;
const stop = luisterTerugvegen({ current: artikel as unknown as HTMLElement }, { current: () => gesloten++ });
function raak(type: string, doel: ElementDubbel, x: number, y: number, tijd: number) {
  let geblokkeerd = false;
  handlers.get(type)!({ type, target: doel, touches: type === "touchend" ? [] : [{ clientX: x, clientY: y }], timeStamp: tijd, cancelable: true, preventDefault: () => { geblokkeerd = true; } });
  return geblokkeerd;
}
for (const doel of doelen) {
  raak("touchstart", doel, 100, 100, 0);
  assert.equal(raak("touchmove", doel, 300, 100, 10), false);
  raak("touchend", doel, 300, 100, 20);
  assert.equal(gesloten, 0);
}
// Verticaal scrollen en de browserrand blijven vrij.
for (const [x, y] of [[100, 300], [10, 100]]) {
  raak("touchstart", tekst, x, 100, 0);
  assert.equal(raak("touchmove", tekst, x === 10 ? 210 : x + 20, y, 10), false);
  raak("touchend", tekst, x, y, 20);
  assert.equal(gesloten, 0);
}
raak("touchstart", tekst, 100, 100, 0);
assert.equal(raak("touchmove", tekst, 300, 100, 10), true);
raak("touchend", tekst, 300, 100, 20);
assert.equal(gesloten, 1);
stop();
console.log("✓ bronlink en deelknop behouden hun aanraakgebaar (#1300)");
