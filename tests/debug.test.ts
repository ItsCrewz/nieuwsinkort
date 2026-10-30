import assert from "node:assert/strict";
import { debugAan, EventRing } from "../src/debug";

assert.equal(debugAan("https://voorbeeld.nl/?debug=1#/dumpert"), true);
assert.equal(debugAan("https://voorbeeld.nl/#/dumpert?debug=1"), true);
assert.equal(debugAan("https://voorbeeld.nl/#/dumpert", { getItem: () => "1" }), true);
assert.equal(debugAan("https://voorbeeld.nl/?debug=0#/dumpert", { getItem: () => null }), false);
assert.equal(debugAan("https://voorbeeld.nl/", { getItem: () => { throw new Error(); } }), false);
const ring = new EventRing();
for (let i = 0; i < 12; i++) ring.voegToe(String(i));
assert.deepEqual(ring.lijst(), Array.from({ length: 10 }, (_, i) => String(i + 2)));
console.log("✓ debugvlag en event-ring");
