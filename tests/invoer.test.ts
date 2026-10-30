import assert from "node:assert/strict";
import { isTouch, volgTouch } from "../src/invoer";

const t = (naam: string, fn: () => void) => { fn(); console.log("✓", naam); };
const mm = (waar: string[]) => (q: string) => ({ matches: waar.includes(q) });

t("telefoon: pointer coarse en hover none = touch", () => {
  assert.equal(isTouch(mm(["(pointer: coarse)", "(hover: none)"])), true);
});
t("alleen één van beide is genoeg", () => {
  assert.equal(isTouch(mm(["(pointer: coarse)"])), true);
  assert.equal(isTouch(mm(["(hover: none)"])), true);
});
t("muis/trackpad = geen touch, ook in een smal venster", () => {
  assert.equal(isTouch(mm(["(max-width: 400px)", "(pointer: fine)", "(hover: hover)"])), false);
});
t("zonder matchMedia: desktop", () => {
  assert.equal(isTouch(undefined), false);
  assert.equal(isTouch(() => null), false);
});
t("volgTouch reageert op wijzigingen en meldt af", () => {
  const nu = new Set<string>();
  const luisteraars: (() => void)[] = [];
  const f = (q: string) => ({
    get matches() { return nu.has(q); },
    addEventListener: (_: string, l: () => void) => luisteraars.push(l),
    removeEventListener: (_: string, l: () => void) => { luisteraars.splice(luisteraars.indexOf(l), 1); },
  }) as unknown as MediaQueryList;
  const uit: boolean[] = [];
  const stop = volgTouch(f, (x) => uit.push(x));
  nu.add("(pointer: coarse)");
  luisteraars.slice().forEach((l) => l());
  assert.equal(uit.at(-1), true);
  nu.clear();
  luisteraars.slice().forEach((l) => l());
  assert.equal(uit.at(-1), false);
  assert.equal(luisteraars.length, 2);
  stop();
  assert.equal(luisteraars.length, 0);
});
