import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { valideer } from "../src/valideer";
import { artikelPad, linkId } from "../src/artikelid";

const bron = JSON.parse(readFileSync("public/data.json", "utf8"));
const geldig = valideer(bron);
assert.equal(geldig.afgewezen, 0);
assert.deepEqual(geldig.data, bron);
const stuk = { ...bron, items: [bron.items[0], null, { ...bron.items[0], punten: [1] }, { ...bron.items[0], bronnen: [null] }], filmpjes: [bron.filmpjes[0], { ...bron.filmpjes[0], titel: 5 }], dumpert: [null] };
const resultaat = valideer(stuk);
assert.equal(resultaat.afgewezen, 5);
assert.deepEqual(resultaat.data.items, [bron.items[0]]);
assert.deepEqual(resultaat.data.filmpjes, [bron.filmpjes[0]]);
assert.deepEqual(resultaat.data.dumpert, []);
for (const waarde of [null, [], { ...bron, items: {} }]) assert.throws(() => valideer(waarde));
for (const datum of [undefined, null, "", "ongeldig", 123]) assert.throws(() => valideer({ ...bron, gegenereerd: datum }));
for (const datum of ["2026-01-01T22:59:59Z", "2026-01-01T23:00:00Z"]) assert.equal(valideer({ ...bron, gegenereerd: datum }).data.gegenereerd, datum);
// Optionele velden (id, t, gisteren): ongeldig = weglaten, bericht blijft; ontbrekend blijft ontbrekend.
const basis = bron.items[0], vid = bron.filmpjes[0];
const zonder = (o: any) => { const { id, t, gisteren, ...rest } = o; return rest; };
const goed = valideer({ ...bron, items: [{ ...zonder(basis), id: "abcd1234", t: 5, gisteren: true }], filmpjes: [{ ...zonder(vid), t: 7 }], dumpert: [] });
assert.equal(goed.afgewezen, 0);
assert.deepEqual([goed.data.items[0].id, goed.data.items[0].t, goed.data.items[0].gisteren, goed.data.filmpjes[0].t], ["abcd1234", 5, true, 7]);
const oud = valideer({ ...bron, items: [zonder(basis)], filmpjes: [zonder(vid)], dumpert: [] });
assert.equal(oud.afgewezen, 0);
for (const k of ["id", "t", "gisteren"]) assert.ok(!(k in oud.data.items[0]));
for (const id of [123, "../x", "ABCD1234", "abc", "abcd12345", null, ""]) {
  const r = valideer({ ...bron, items: [{ ...basis, id }], filmpjes: [], dumpert: [] });
  assert.equal(r.afgewezen, 0);
  assert.ok(!("id" in r.data.items[0]));
  assert.equal(artikelPad(r.data.items[0], "2026-01-01").split("/")[3].slice(0, 8), linkId(basis.bronnen[0].href));
}
for (const t of ["5", NaN, Infinity, null, {}]) {
  const r = valideer({ ...bron, items: [{ ...basis, t }], filmpjes: [{ ...vid, t }], dumpert: [{ ...vid, t }] });
  assert.equal(r.afgewezen, 0);
  assert.ok(!("t" in r.data.items[0]) && !("t" in r.data.filmpjes[0]) && !("t" in r.data.dumpert[0]));
}
for (const gisteren of ["ja", 1, null]) assert.ok(!("gisteren" in valideer({ ...bron, items: [{ ...basis, gisteren }], filmpjes: [], dumpert: [] }).data.items[0]));
console.log("✓ data.json-validatie en ongeldige berichten");
