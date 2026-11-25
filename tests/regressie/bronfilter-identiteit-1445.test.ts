// #1445: een bericht zonder id houdt dezelfde artikel-, deel- en openroute na uit- en aanzetten van de eerste bron.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { artikelId, artikelPad } from "../../src/artikelid";
import { artikelUrl } from "../../src/delen";
import { buildSources, filterArtikelBronnen, sourceKey } from "../../src/sources";
import type { Item } from "../../src/types";

const basis = JSON.parse(readFileSync("tests/regressie/fixtures/artikel-bronnen-829.json", "utf8")) as Item;
const { id: _weg, ...zonderId } = basis;
const item = zonderId as Item;
const { index } = buildSources(null, null);
const sleutel = (i: number) => sourceKey(index, "nl", item.bronnen[i].site, item.bronnen[i].href);
const dag = "2026-11-04";
const open = (i: Item) => artikelId(i) || "";

assert.equal(item.id, undefined);
const bron = (uit: Set<string>) => filterArtikelBronnen(item, index, uit)!;
const aan = bron(new Set());
const eerstUit = bron(new Set([sleutel(0)]));
const weerAan = bron(new Set());
assert.deepEqual(eerstUit.bronnen, [item.bronnen[1]]); // uitgezette bron blijft verborgen
assert.equal(bron(new Set([sleutel(0), sleutel(1)])), null);
for (const i of [aan, eerstUit, weerAan]) {
  assert.equal(artikelId(i), artikelId(item));
  assert.equal(artikelPad(i, dag), artikelPad(item, dag));
  assert.equal(artikelUrl(i, dag), artikelUrl(item, dag)); // delen
  assert.equal(open(i), open(item)); // openen (route-id)
}
// Tweede bron uitzetten verandert niets aan de identiteit; het gefilterde bericht wordt zelf stabiel.
assert.equal(artikelId(bron(new Set([sleutel(1)]))), artikelId(item));
assert.equal(artikelId(filterArtikelBronnen(eerstUit, index, new Set())!), artikelId(item));
// Bronloos bericht blijft ongewijzigd.
const bronloos = { ...item, bronnen: [] } as Item;
assert.equal(filterArtikelBronnen(bronloos, index, new Set([sleutel(0)])), bronloos);
assert.equal(artikelId(bronloos), "");
