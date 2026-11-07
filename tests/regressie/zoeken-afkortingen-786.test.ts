import assert from "node:assert/strict";
import { zoekItems } from "../../src/zoek";
import type { Item } from "../../src/types";

const kop = { cat: "nl", kop: "Nieuws uit de V.S." } as Item;
const samenvatting = { cat: "nl", kop: "Buitenlands nieuws", samenvatting: "De VS spreekt met Europa." } as Item;
const losseWoorden = { cat: "nl", kop: "Vrede en veiligheid", samenvatting: "Samen werken aan oplossingen." } as Item;
const andereTekens = { cat: "nl", kop: "V-S en café nieuws" } as Item;

for (const query of ["VS", "V.S.", "v.s"]) {
  assert.deepEqual(zoekItems([kop, samenvatting, losseWoorden, andereTekens], query), [kop, samenvatting], query);
}
assert.deepEqual(zoekItems([kop], "nieuws VS"), [kop]);
assert.deepEqual(zoekItems([samenvatting], "V.S. europa"), [samenvatting]);
assert.deepEqual(zoekItems([losseWoorden], "vrede samen"), [losseWoorden]);
assert.deepEqual(zoekItems([andereTekens], "v-s cafe"), [andereTekens]);
assert.deepEqual(zoekItems([{ cat: "nl", kop: "Advies uit Europa" } as Item], "VS"), []);
