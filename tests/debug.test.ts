import assert from "node:assert/strict";
import { debugAan, EventRing } from "../src/debug";
import { frameRegel } from "../src/debug-overlay";

assert.equal(debugAan("https://voorbeeld.nl/?debug=1#/dumpert"), true);
assert.equal(debugAan("https://voorbeeld.nl/#/dumpert?debug=1"), true);
assert.equal(debugAan("https://voorbeeld.nl/#/dumpert", { getItem: () => "1" }), true);
assert.equal(debugAan("https://voorbeeld.nl/?debug=0#/dumpert", { getItem: () => null }), false);
assert.equal(debugAan("https://voorbeeld.nl/", { getItem: () => { throw new Error(); } }), false);
const ring = new EventRing();
for (let i = 0; i < 12; i++) ring.voegToe(String(i));
assert.deepEqual(ring.lijst(), Array.from({ length: 10 }, (_, i) => String(i + 2)));
assert.equal(frameRegel(0, 0, undefined, 0), " beeld 0x0 frames -");
assert.equal(frameRegel(720, 1280, { gepresenteerd: 12, gedecodeerd: 14, op: 1000, mediaTijd: 3.25, rvfc: true, decode: true, gen: 4 }, 3500),
  " beeld 720x1280 gen 4 rvfc+dec frames 12/14 laatste 2.5s pts 3.3");
console.log("✓ debugvlag, event-ring en beeldregel");
