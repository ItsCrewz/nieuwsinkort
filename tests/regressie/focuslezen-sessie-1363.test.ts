import assert from "node:assert/strict";
import { bewaarFocusKeuze, FOCUS_KEY, leesFocusKeuze, volgFocusKeuze, type FocusStorage } from "../../src/focuslezen";

function opslag(): FocusStorage {
  const data = new Map<string, string>();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}
const kapot: FocusStorage = {
  getItem() { throw new Error("geblokkeerd"); },
  setItem() { throw new Error("geblokkeerd"); },
  removeItem() { throw new Error("geblokkeerd"); },
};

const sessie = opslag();
assert.equal(leesFocusKeuze(kapot, sessie), false);
for (const keuze of [true, false, true]) {
  bewaarFocusKeuze(kapot, keuze, sessie);
  assert.equal(leesFocusKeuze(kapot, sessie), keuze);
}
assert.equal(leesFocusKeuze(kapot, opslag()), false);
assert.doesNotThrow(() => bewaarFocusKeuze(kapot, true, kapot));
assert.equal(leesFocusKeuze(kapot, kapot), false);

// Ook bij een leesbare maar niet schrijfbare lokale opslag wint de recente sessiekeuze.
const lokaal = opslag();
bewaarFocusKeuze(lokaal, false);
const nietSchrijfbaar = { ...lokaal, setItem: kapot.setItem };
bewaarFocusKeuze(nietSchrijfbaar, true, sessie);
assert.equal(leesFocusKeuze(nietSchrijfbaar, sessie), true);
bewaarFocusKeuze(lokaal, false, sessie);
assert.equal(leesFocusKeuze(lokaal, sessie), false);
assert.equal(leesFocusKeuze(lokaal, kapot), false);

// Een wijziging uit een ander tabblad verwijdert een eventuele oude terugval.
bewaarFocusKeuze(kapot, true, sessie);
const g = globalThis as unknown as { window?: unknown; sessionStorage?: FocusStorage };
const oudVenster = g.window, oudeSessie = g.sessionStorage;
let luister: ((e: { key: string | null; newValue: string | null; storageArea: unknown }) => void) | undefined;
g.window = { localStorage: lokaal, addEventListener: (_: string, f: typeof luister) => { luister = f; }, removeEventListener() {} };
g.sessionStorage = sessie;
try {
  const ontvangen: boolean[] = [];
  const stop = volgFocusKeuze((v) => ontvangen.push(v));
  luister?.({ key: FOCUS_KEY, newValue: "uit", storageArea: lokaal });
  assert.deepEqual(ontvangen, [false]);
  assert.equal(leesFocusKeuze(lokaal, sessie), false);
  stop();
} finally {
  if (oudVenster === undefined) delete g.window; else g.window = oudVenster;
  if (oudeSessie === undefined) delete g.sessionStorage; else g.sessionStorage = oudeSessie;
}
