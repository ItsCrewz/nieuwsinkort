import assert from "node:assert/strict";
import { magVooruitladen, toonBeeld } from "../src/beelden";

assert.equal(magVooruitladen(true), false);
assert.equal(magVooruitladen(false), true);
assert.equal(toonBeeld(true, true, true, true, true), true);
assert.equal(toonBeeld(true, false, true, true, true), false);
assert.equal(toonBeeld(true, true, true, false, true), false);
assert.equal(toonBeeld(false, false, true, false, true), true);
assert.equal(toonBeeld(false, true, false, true, true), false);
assert.equal(toonBeeld(false, true, true, false, false), false);
console.log("Databesparing voor beelden: oké");
