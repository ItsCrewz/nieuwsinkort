// Draai: npm run test  (focus lezen: standaard uit, alleen expliciete keuze, src/focuslezen.ts)
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { bewaarFocusKeuze, FOCUS_KEY, leesFocusKeuze, ruimOudeFocusKeuzeOp, volgFocusKeuze, type FocusStorage } from "../src/focuslezen";

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log("✓", name); };
const OUD = "dagelijks-nieuws-focus-lezen-v2";
function maakStorage(start: Record<string, string> = {}): FocusStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(start));
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}
const kapot: FocusStorage = {
  getItem() { throw new Error("geblokkeerd"); },
  setItem() { throw new Error("geblokkeerd"); },
  removeItem() { throw new Error("geblokkeerd"); },
};

t("nieuwe bezoeker (lege storage) → uit", () => {
  assert.equal(leesFocusKeuze(maakStorage()), false);
  assert.equal(leesFocusKeuze(null), false);
  assert.equal(leesFocusKeuze(undefined), false);
});

t("expliciete keuze aan en uit blijft na herladen staan", () => {
  const s = maakStorage();
  bewaarFocusKeuze(s, true);
  assert.equal(leesFocusKeuze(s), true);
  bewaarFocusKeuze(s, false);
  assert.equal(leesFocusKeuze(s), false);
  bewaarFocusKeuze(s, true);
  assert.equal(leesFocusKeuze(s), true); // opnieuw lezen = herladen
});

t("oude opgeslagen standaard zonder expliciete keuze → uit, en wordt opgeruimd", () => {
  const s = maakStorage({ [OUD]: "1" });
  assert.equal(leesFocusKeuze(s), false);
  ruimOudeFocusKeuzeOp(s);
  assert.equal(s.data.has(OUD), false);
  const s2 = maakStorage({ [OUD]: "1" });
  bewaarFocusKeuze(s2, false);
  assert.equal(s2.data.has(OUD), false);
});

t("storage die gooit → uit, zonder fout", () => {
  assert.equal(leesFocusKeuze(kapot), false);
  assert.doesNotThrow(() => bewaarFocusKeuze(kapot, true));
  assert.doesNotThrow(() => ruimOudeFocusKeuzeOp(kapot));
});

// Nep-venster met storage-listeners (#1029).
type Ev = { key: string | null; newValue: string | null; storageArea?: unknown };
function metVenster(win: unknown, fn: () => void) {
  const g = globalThis as unknown as { window?: unknown };
  const oud = g.window;
  g.window = win;
  try { fn(); } finally { if (oud === undefined) delete g.window; else g.window = oud; }
}
function maakVenster() {
  const ls = {};
  const luisteraars = new Set<(e: Ev) => void>();
  const win = {
    localStorage: ls,
    addEventListener: (_: string, f: (e: Ev) => void) => void luisteraars.add(f),
    removeEventListener: (_: string, f: (e: Ev) => void) => void luisteraars.delete(f),
  };
  return { win, ls, luisteraars, stuur: (e: Ev) => luisteraars.forEach((f) => f(e)) };
}

t("ander tabblad: aan, uit, verwijderd en clear() volgen de keuze", () => {
  const v = maakVenster();
  metVenster(v.win, () => {
    const got: boolean[] = [];
    const stop = volgFocusKeuze((a) => got.push(a));
    v.stuur({ key: FOCUS_KEY, newValue: "aan", storageArea: v.ls });
    v.stuur({ key: FOCUS_KEY, newValue: "uit", storageArea: v.ls });
    v.stuur({ key: FOCUS_KEY, newValue: "aan", storageArea: v.ls });
    v.stuur({ key: FOCUS_KEY, newValue: null, storageArea: v.ls });
    v.stuur({ key: FOCUS_KEY, newValue: "aan", storageArea: v.ls });
    v.stuur({ key: null, newValue: null, storageArea: v.ls });
    assert.deepEqual(got, [true, false, true, false, true, false]);
    stop();
  });
});

t("andere sleutels en andere opslag worden genegeerd", () => {
  const v = maakVenster();
  metVenster(v.win, () => {
    const got: boolean[] = [];
    volgFocusKeuze((a) => got.push(a));
    v.stuur({ key: "iets-anders", newValue: "aan", storageArea: v.ls });
    v.stuur({ key: FOCUS_KEY, newValue: "aan", storageArea: {} });
    assert.deepEqual(got, []);
  });
});

t("opruimen haalt de listener weg; ontbrekend venster of kapotte listener gooit niet", () => {
  const v = maakVenster();
  metVenster(v.win, () => {
    const stop = volgFocusKeuze(() => {});
    assert.equal(v.luisteraars.size, 1);
    stop();
    assert.equal(v.luisteraars.size, 0);
    assert.doesNotThrow(() => stop());
  });
  metVenster(undefined, () => {
    let stop = () => {};
    assert.doesNotThrow(() => { stop = volgFocusKeuze(() => {}); });
    assert.doesNotThrow(() => stop());
  });
  metVenster({ addEventListener() { throw new Error("nee"); } }, () => {
    assert.doesNotThrow(() => volgFocusKeuze(() => {})());
  });
});

t("volgFocusKeuze schrijft niet terug in de opslag", () => {
  const s = maakStorage();
  const v = maakVenster();
  metVenster(v.win, () => { volgFocusKeuze(() => {}); v.stuur({ key: FOCUS_KEY, newValue: "aan", storageArea: v.ls }); });
  assert.equal(s.data.size, 0);
});

t("App.tsx koppelt volgFocusKeuze met opruimen bij unmount", () => {
  const src = readFileSync("src/App.tsx", "utf8");
  assert.match(src, /useEffect\(\(\) => volgFocusKeuze\(setBionic\), \[\]\)/);
});

console.log(`${n} tests ok`);
