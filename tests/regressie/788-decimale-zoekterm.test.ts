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

const duizend = { cat: "nl", kop: "Café kost 2.500 euro" } as Item;
const datum = { cat: "nl", kop: "Datum 12.11.2026" } as Item;
const versie = { cat: "nl", kop: "iOS 17.4 verschijnt" } as Item;
for (const term of ["500", "2 500"]) assert.deepEqual(zoekItems([duizend], term), [duizend]);
assert.deepEqual(zoekItems([datum], "12 11 2026"), [datum]);
for (const term of ["17", "17.4", "17,4"]) assert.deepEqual(zoekItems([versie], term), [versie]);
assert.deepEqual(markeerDelen(versie.kop!, "17"), [{ tekst: "iOS ", markeer: false }, { tekst: "17", markeer: true }, { tekst: ".4 verschijnt", markeer: false }]);
assert.deepEqual(markeerDelen(versie.kop!, "17,4"), [{ tekst: "iOS ", markeer: false }, { tekst: "17.4", markeer: true }, { tekst: " verschijnt", markeer: false }]);
// Een punt met drie cijfers wordt als duizendtalscheiding gelezen.
assert.deepEqual(zoekItems([{ cat: "nl", kop: "2 auto's en 500 fietsen" } as Item], "2.500").length, 1);
assert.deepEqual(markeerDelen("Café: 2,5", "5"), [{ tekst: "Café: 2,5", markeer: false }]);
