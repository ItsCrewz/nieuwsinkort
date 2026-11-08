import assert from "node:assert/strict";
import { magStartenOp, besluit, sluit } from "../../src/terugvegen";

// De elementen volgen de bestaande artikel-, lead- en deelknopstructuur uit detail.tsx.
function element(ouder: Element | null, uitgesloten = false): Element {
  return {
    parentElement: ouder,
    scrollWidth: 0,
    clientWidth: 0,
    matches: () => uitgesloten,
    contains(doel: Element) {
      for (let e: Element | null = doel; e; e = e.parentElement) if (e === this) return true;
      return false;
    },
  } as unknown as Element;
}

const shell = element(null);
const artikel = element(shell);
const lead = element(artikel);
const invoer = element(artikel, true);
const buiten = element(shell);
const deelportaal = element(null);

assert.equal(magStartenOp(artikel, artikel), true);
assert.equal(magStartenOp(artikel, lead), true);
assert.equal(besluit(200, 0), "veeg");
assert.equal(sluit(200, 390, 500), true);
for (const doel of [invoer, buiten, deelportaal, null]) assert.equal(magStartenOp(artikel, doel), false);
assert.equal(magStartenOp(null, lead), false);
console.log("✓ terugvegen begint alleen op een toegestaan deel van het artikel (#740)");
