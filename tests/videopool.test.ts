import { strict as assert } from "node:assert";
import { bronIndexen, gebruiktNativeHls, isZuinig, voorbuffer, slotVan, videopool } from "../src/videopool";

assert.deepEqual(videopool(2, 5, false, false), [
  { slot: 0, index: 3, bron: true }, { slot: 1, index: 1, bron: false }, { slot: 2, index: 2, bron: true },
]);
assert.deepEqual(videopool(2, 5, true, false).filter((s) => s.bron).map((s) => s.index).sort(), [2, 3]);
assert.deepEqual(videopool(2, 5, false, true).filter((s) => s.bron).map((s) => s.index), [2]);
assert.deepEqual(videopool(0, 1, false, false).map((s) => s.index), [0, null, null]);
assert.deepEqual(videopool(4, 5, false, false).filter((s) => s.index !== null).map((s) => s.index).sort(), [3, 4]);
const voor = videopool(2, 10, false, false);
const na = videopool(3, 10, false, false);
assert.equal(voor.filter((s, i) => s.index !== na[i].index).length, 1);
assert.deepEqual([...bronIndexen(2, 5, true, false)].sort(), [2, 3]);
assert.deepEqual([...bronIndexen(2, 5, false, false)].sort(), [2, 3]);
assert.deepEqual([...bronIndexen(4, 5, true, false)], [4]);
assert.deepEqual([slotVan(0), slotVan(1), slotVan(2), slotVan(3), slotVan(7)], [0, 1, 2, 0, 1]);
for (let a = 0; a < 20; a++) assert.equal(new Set([a - 1, a, a + 1].map(slotVan)).size, 3);
assert.equal(gebruiktNativeHls(true, "Apple Computer, Inc.", "", true), true);
assert.equal(gebruiktNativeHls(true, "Google Inc.", "Mozilla/5.0 (Linux)", true), false);
assert.equal(gebruiktNativeHls(true, "", "", false), true);
assert.equal(gebruiktNativeHls(false, "Apple", "iPhone", true), false);
assert.equal(isZuinig({ saveData: true }), true);
assert.equal(isZuinig({ effectiveType: "2g" }), true);
assert.equal(isZuinig({ effectiveType: "slow-2g" }), true);
assert.equal(isZuinig({ effectiveType: "4g" }), false);
assert.equal(isZuinig(undefined), false);
console.log("videopool: tests geslaagd");

assert.equal(voorbuffer({ type: "wifi" }), 4);
assert.equal(voorbuffer({ type: "cellular" }), 2);
assert.equal(voorbuffer({ effectiveType: "3g" }), 2);
assert.equal(voorbuffer({ saveData: true }), 0);
assert.equal(voorbuffer({ effectiveType: "2g" }), 0);
// Schatting bij 500 kbit/s en één ongezien volgend filmpje; segmenten kunnen groter zijn.
assert.ok(voorbuffer({ type: "wifi" }) * 500_000 / 8 <= 1_550_000);
assert.ok(voorbuffer({ type: "cellular" }) * 500_000 / 8 <= 360_000);
