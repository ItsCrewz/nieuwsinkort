import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { zoekItems } from "../../src/zoek";
import type { Item } from "../../src/types";

const items = JSON.parse(readFileSync("tests/regressie/fixtures/zoeken-854.json", "utf8")) as Item[];
for (const term of ["Straße", "Strasse", "STRASSE", "STRAẞE"]) {
  assert.deepEqual(zoekItems(items, term), items.slice(0, 4), term);
}
assert.deepEqual(zoekItems(items, "bahnhofstraße"), [items[4]]);
console.log("zoeken-854: tests geslaagd");
