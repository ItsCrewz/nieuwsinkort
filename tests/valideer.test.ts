import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { valideer } from "../src/valideer";

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
for (const waarde of [null, [], { ...bron, items: {} }, { ...bron, weer: null }]) assert.throws(() => valideer(waarde));
console.log("✓ data.json-validatie en ongeldige berichten");
