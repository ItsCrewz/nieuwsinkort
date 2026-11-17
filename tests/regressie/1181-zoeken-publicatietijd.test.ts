import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { zoekItems } from "../../src/zoek";
import { filterNieuws, STANDAARD } from "../../src/filters";
import type { Item } from "../../src/types";

const berichten = JSON.parse(readFileSync("tests/fixtures/joey/dubbel-feiten.json", "utf8")) as Item[];
const [bericht, ander] = berichten;
assert.deepEqual(zoekItems(berichten, "10:21"), [bericht]);
assert.deepEqual(zoekItems(berichten, "10:05"), [ander]);
assert.deepEqual(zoekItems([bericht, { ...ander, tijd: "21:10" }], "10:21"), [bericht]);
assert.deepEqual(zoekItems([{ ...bericht, tijd: "" }, { ...bericht, tijd: undefined } as unknown as Item], "10:21"), []);
assert.deepEqual(zoekItems([bericht], "batterijpaspoort"), [bericht]);
const selectie = filterNieuws(berichten.filter((item) => item.cat === "auto"), { ...STANDAARD, tijd: "alles" }, 0, "2026-11-02T12:00:00Z", false).items;
assert.deepEqual(zoekItems(selectie, "10:21"), [bericht]);
assert.deepEqual(zoekItems(selectie.filter((item) => item !== bericht), "10:21"), []);
