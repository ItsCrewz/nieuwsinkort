import assert from "node:assert/strict";
import { markeerDelen, normaliseer, zoekItems } from "../../src/zoek";
import type { Item } from "../../src/types";

const gewoon = { cat: "nl", kop: "AI in café 2024" } as Item;
const breed = { cat: "nl", kop: "ＡＩ in café ２０２４" } as Item;
const midden = { cat: "nl", kop: "Trainingskamp 2024" } as Item;

for (const term of ["AI cafe 2024", "ＡＩ cafe ２０２４", "ＡＩ CAFÉ 2024"]) {
  assert.deepEqual(zoekItems([gewoon, breed, midden], term), [gewoon, breed]);
}
assert.deepEqual(zoekItems([midden], "ＡＩ"), []);
assert.equal(normaliseer("ＡＩ ２０２４ ①"), "ai 2024 ①");
assert.deepEqual(markeerDelen(breed.kop, "AI 2024"), [
  { tekst: "ＡＩ", markeer: true }, { tekst: " in café ", markeer: false }, { tekst: "２０２４", markeer: true },
]);
assert.deepEqual(markeerDelen(gewoon.kop, "ＡＩ"), [
  { tekst: "AI", markeer: true }, { tekst: " in café 2024", markeer: false },
]);
