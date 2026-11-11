import assert from "node:assert/strict";
import { normaliseer, zoekItems } from "../../src/zoek";
import type { Item } from "../../src/types";

const komma = { cat: "nl", kop: "Café kost 2,5 miljoen" } as Item;
const punt = { cat: "nl", kop: "Kosten", samenvatting: "Het café kost 2.5 miljoen" } as Item;
const losseCijfers = { cat: "nl", kop: "2 auto's en 5 fietsen bij het café" } as Item;
const anderGetal = { cat: "nl", kop: "Café kost 2,50 miljoen" } as Item;
const items = [komma, punt, losseCijfers, anderGetal];

assert.equal(normaliseer("CAFÉ 2.5, nieuws"), "cafe 2,5 nieuws");
for (const query of ["2,5", "2.5", "CAFÉ 2,5", "cafe 2.5"]) {
  assert.deepEqual(zoekItems(items, query), [komma, punt], query);
}
assert.deepEqual(zoekItems(items, "2 5"), [losseCijfers]);
assert.deepEqual(zoekItems(items, "caf milj"), [komma, punt, anderGetal]);

const datum = { cat: "nl", kop: "Nieuws van 7.11.2026" } as Item;
const tijd = { cat: "nl", kop: "Uitzending om 20.30 uur" } as Item;
for (const query of ["2026", "11", "7 11 2026"]) assert.deepEqual(zoekItems([datum], query), [datum], query);
for (const query of ["20 30", "20:30"]) assert.deepEqual(zoekItems([tijd], query), [tijd], query);
