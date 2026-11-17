import assert from "node:assert/strict";
import fixture from "./fixtures/nieuws-676.json";
import { filterNieuws, STANDAARD } from "../../src/filters";
import type { Item } from "../../src/types";

const oudNu = Date.now;
try {
  Date.now = () => Date.parse("2026-10-25T02:45:00+01:00");
  const gen = new Date(Date.now()).toISOString();
  const bericht = (kop: string, tijd: string, t?: number): Item => ({ ...fixture, cat: "nl", kop, tijd, t });
  const eerste = Date.parse("2026-10-25T02:30:00+02:00");
  const tweede = Date.parse("2026-10-25T02:30:00+01:00");
  const items = [bericht("eerste", "02:30", eerste), bericht("tweede", "02:30", tweede),
    bericht("oud formaat", "02:40"), bericht("zonder datum", ""), bericht("ongeldig", "02:35", NaN)];
  const filter = (tijd: typeof STANDAARD.tijd, sort: typeof STANDAARD.sort = "nieuw") =>
    filterNieuws(items, { ...STANDAARD, tijd, sort }, eerste + 1, gen, true);
  assert.deepEqual(filter("alles").items.map((x) => x.kop), ["oud formaat", "ongeldig", "tweede", "eerste", "zonder datum"]);
  assert.deepEqual(filter("alles", "oud").items.map((x) => x.kop), ["eerste", "tweede", "ongeldig", "oud formaat", "zonder datum"]);
  assert.deepEqual(filter("1u").items.map((x) => x.kop), ["oud formaat", "ongeldig", "tweede", "zonder datum"]);
  assert.equal(filter("3u").per["1u"], 4);
  assert.equal(filter("sinds").per.sinds, 4);
  const nieuw = Array.from({ length: 5 }, (_, i) => bericht(`nieuw ${i}`, "00:00", tweede + i));
  const auto = filterNieuws([bericht("oud", "02:30", eerste), ...nieuw], STANDAARD, eerste + 1, gen, true);
  assert.equal(auto.tijd, "sinds");
  assert.equal(auto.nieuwSinds, 5);
  assert.equal(auto.items.length, 5);
  console.log("✓ nieuwsfilters gebruiken publicatietijden en behouden de terugval voor oude data");
} finally {
  Date.now = oudNu;
}
