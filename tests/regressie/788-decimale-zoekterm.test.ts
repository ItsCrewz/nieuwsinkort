import assert from "node:assert/strict";
import { markeerDelen, normaliseer, zoekItems } from "../../src/zoek";
import type { Item } from "../../src/types";

// Het voorbeeld uit de melding: losse aantallen zijn geen decimaal getal.
const los = { cat: "nl", kop: "2 auto's en 5 fietsen" } as Item;
const komma = { cat: "nl", kop: "Café verkoopt 2,5 miljoen kopjes" } as Item;
const punt = { cat: "nl", kop: "Café groeit", ai: "De omzet stijgt met 2.5 procent." } as Item;
const langer = { cat: "nl", kop: "Café groeit 2,50 procent" } as Item;
const items = [los, komma, punt, langer];

assert.equal(normaliseer("Café 2,5 en 2.5"), "cafe 2.5 en 2.5");
for (const term of ["2,5", "2.5", "CAFÉ 2,5", "cafe 2.5"]) {
  assert.deepEqual(zoekItems(items, term), [komma, punt], term);
}
assert.deepEqual(zoekItems(items, "2 5"), [los]);
assert.deepEqual(zoekItems(items, "2 auto"), [los]);
assert.deepEqual(zoekItems(items, "cafe groei"), [punt, langer]);
assert.deepEqual(markeerDelen("Café: 2,5", "cafe 2.5"), [
  { tekst: "Café", markeer: true }, { tekst: ": ", markeer: false }, { tekst: "2,5", markeer: true },
]);
