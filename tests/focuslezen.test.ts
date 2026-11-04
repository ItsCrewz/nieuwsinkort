// Draai: npm run test  (focus lezen: standaard uit, alleen expliciete keuze, src/focuslezen.ts)
import assert from "node:assert/strict";
import { bewaarFocusKeuze, leesFocusKeuze, ruimOudeFocusKeuzeOp, type FocusStorage } from "../src/focuslezen";

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

console.log(`${n} tests ok`);
