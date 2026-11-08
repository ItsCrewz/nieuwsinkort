import assert from "node:assert/strict";
import { TOUCH_QUERIES, isTouch, touchNu, volgTouch } from "../src/invoer";

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

t("TOUCH_QUERIES bevat precies de twee queries", () => {
  assert.deepEqual([...TOUCH_QUERIES], ["(pointer: coarse)", "(hover: none)"]);
});
t("isTouch: lege matchMedia-resultaten en onbekende queries", () => {
  assert.equal(isTouch(() => undefined), false);
  assert.equal(isTouch(mm([])), false);
  assert.equal(isTouch(mm(["(pointer: fine)"])), false);
  assert.equal(isTouch(null), false);
});
t("isTouch: tweede query beslist als de eerste null geeft", () => {
  assert.equal(isTouch((q) => (q === "(hover: none)" ? { matches: true } : null)), true);
});
t("volgTouch zonder matchMedia: no-op afmelder", () => {
  assert.equal(typeof volgTouch(null, () => {}), "function");
  volgTouch(undefined, () => { throw new Error("niet aanroepen"); })();
});
t("volgTouch: luistert op beide queries en tolereert ontbrekende addEventListener", () => {
  const gezien: string[] = [];
  const f = (q: string) => { gezien.push(q); return { matches: false } as unknown as MediaQueryList; };
  const stop = volgTouch(f, () => {});
  assert.deepEqual(gezien, [...TOUCH_QUERIES]);
  stop();
});
t("volgTouch: na afmelden geen luisteraars meer, meerdere keren afmelden is veilig", () => {
  const l: (() => void)[] = [];
  const f = () => ({
    matches: false,
    addEventListener: (_: string, fn: () => void) => l.push(fn),
    removeEventListener: (_: string, fn: () => void) => { const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); },
  }) as unknown as MediaQueryList;
  const stop = volgTouch(f, () => {});
  stop();
  stop();
  assert.equal(l.length, 0);
});
t("touchNu zonder window: desktop", () => {
  assert.equal(typeof (globalThis as { window?: unknown }).window, "undefined");
  assert.equal(touchNu(), false);
});
