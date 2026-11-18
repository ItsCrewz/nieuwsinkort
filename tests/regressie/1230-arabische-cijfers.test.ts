import assert from "node:assert/strict";
import { markeerDelen, normaliseer, zoekItems } from "../../src/zoek";
import type { Item } from "../../src/types";

const west = { cat: "nl", kop: "Verkiezingen 2026" } as Item;
const arabisch = { cat: "nl", kop: "Verkiezingen ٢٠٢٦" } as Item;
const perzisch = { cat: "nl", kop: "Verkiezingen ۲۰۲۶" } as Item;
const gemengd = { cat: "nl", kop: "Verkiezingen ٢0٢٦" } as Item;
const ander = { cat: "nl", kop: "Verkiezingen 20260 en 202" } as Item;
const alle = [west, arabisch, perzisch, gemengd, ander];

for (const term of ["2026", "٢٠٢٦", "۲۰۲۶", "٢0٢٦"]) {
  assert.deepEqual(zoekItems(alle, term), [west, arabisch, perzisch, gemengd], term);
}
assert.deepEqual(zoekItems(alle, "202"), [ander]);
assert.deepEqual(zoekItems(alle, "20260"), [ander]);
assert.equal(normaliseer("٠١٢٣٤٥٦٧٨٩ ۰۱۲۳۴۵۶۷۸۹"), "0123456789 0123456789");
assert.deepEqual(markeerDelen(arabisch.kop, "2026"), [
  { tekst: "Verkiezingen ", markeer: false }, { tekst: "٢٠٢٦", markeer: true },
]);
