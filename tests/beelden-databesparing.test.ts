import assert from "node:assert/strict";
import { magVooruitladen, toonBeeld, dichtBij } from "../src/beelden";

assert.equal(magVooruitladen(true), false);
assert.equal(magVooruitladen(false), true);
assert.equal(toonBeeld(true, true, true, true, true), true);
assert.equal(toonBeeld(true, false, true, true, true), false);
assert.equal(toonBeeld(true, true, true, false, true), false);
assert.equal(toonBeeld(false, false, true, false, true), true);
assert.equal(toonBeeld(false, true, false, true, true), false);
assert.equal(toonBeeld(false, true, true, false, false), false);
// Zonder IntersectionObserver: alleen kaarten binnen 200% schermhoogte tellen als near (#1266)
assert.equal(dichtBij(0, 400, 800), true);
assert.equal(dichtBij(2400, 2800, 800), true);
assert.equal(dichtBij(2401, 2800, 800), false);
assert.equal(dichtBij(-2000, -1600, 800), true);
assert.equal(dichtBij(-2100, -1601, 800), false);
const telNear = (scroll: number) => Array.from({ length: 200 }, (_, k) => k * 400 - scroll).filter((top) => dichtBij(top, top + 400, 800)).length;
assert.ok(telNear(0) < 10, "bij een lange lijst laden niet alle kaarten");
assert.ok(telNear(20000) < 15);
assert.ok(dichtBij(50000 - 20000, 50400 - 20000, 800) === false);
assert.equal(dichtBij(0, 400, 800) && telNear(0) > 0, true);
console.log("Databesparing voor beelden: oké");
