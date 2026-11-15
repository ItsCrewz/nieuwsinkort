import assert from "node:assert/strict";
import { markeerDelen, zoekItems } from "../../src/zoek";
import type { Item } from "../../src/types";

const naam = { cat: "nl", kop: "Σωκράτης in Athene" } as Item;
const midden = { cat: "nl", kop: "Σωκράτησ in Athene" } as Item;
const items = [naam, midden];
for (const term of ["Σωκράτης", "σωκράτησ", "ΣΩΚΡΆΤΗΣ", "athene σωκράτησ", "ΣΩΚΡΆΤΗΣ ATHENE"]) {
  assert.deepEqual(zoekItems(items, term), items, term);
}
assert.deepEqual(zoekItems(items, "κράτης"), []);
assert.deepEqual(zoekItems(items, "σωκράτησ rotterdam"), []);
assert.deepEqual(markeerDelen("σος", "σοσ"), [{ tekst: "σος", markeer: true }]);
