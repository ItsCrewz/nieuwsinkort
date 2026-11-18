import assert from "node:assert/strict";
import { markeerDelen, normaliseer, zoekItems } from "../../src/zoek";
import type { Item } from "../../src/types";

const gewoon = { cat: "nl", kop: "Brand in Amsterdam vandaag" } as Item;
const verborgen = { cat: "nl", kop: "Brand in Amster​dam en Rot­terdam" } as Item;
// Beide richtingen: onzichtbaar teken in de term of in de tekst.
for (const term of ["Amsterdam", "Amster​dam", "Amster­dam", "Am⁠ster﻿dam", "Amster‌dam"]) {
  assert.deepEqual(zoekItems([gewoon, verborgen], term), [gewoon, verborgen], JSON.stringify(term));
}
assert.deepEqual(zoekItems([verborgen], "rotterdam"), [verborgen]);
// Echte spaties blijven woordgrenzen.
assert.deepEqual(zoekItems([gewoon, verborgen], "Amster dam"), []);
assert.deepEqual(zoekItems([gewoon, verborgen], "Amster dam"), []);
assert.deepEqual(zoekItems([gewoon, verborgen], "brand vandaag"), [gewoon]);
// Uitsluit- en aanhalingsterm.
assert.deepEqual(zoekItems([gewoon, verborgen], "brand -Amster​dam"), []);
assert.deepEqual(zoekItems([gewoon, verborgen], "\"brand in Amster​dam\""), [gewoon, verborgen]);
assert.equal(normaliseer("Amster​dam"), "amsterdam");
assert.equal(normaliseer("Amster dam"), "amster dam");
assert.deepEqual(markeerDelen("Amster​dam nu", "amsterdam"), [{ tekst: "Amster​dam", markeer: true }, { tekst: " nu", markeer: false }]);
