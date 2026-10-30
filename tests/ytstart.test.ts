import assert from "node:assert/strict";
import { ytStartBesluit, ytSkipBesluit, ytStatusNaam, ytEchteFout, geluidMag, autoplayGeblokkeerd } from "../src/ytstart";

const basis = { actief: true, gepauzeerd: false, klaar: true, status: -1, pogingen: 0, sinds: 1000, nu: 1000 };
// onReady, -1 en geen verdere events: drie pogingen binnen de activatietijd.
for (let i = 0; i < 3; i++) assert.equal(ytStartBesluit({ ...basis, pogingen: i, nu: 1000 + i * 500 }), "probeer");
assert.equal(ytStartBesluit({ ...basis, pogingen: 3, nu: 2500 }), "vangnet");
// Een al klaargemaakte buur start onmiddellijk bij activatie.
assert.equal(ytStartBesluit(basis), "probeer");
assert.equal(ytStartBesluit({ ...basis, gepauzeerd: true, nu: 2500 }), "vangnet");
assert.equal(ytStartBesluit({ ...basis, klaar: false, nu: 2500 }), "vangnet");
for (const status of [1, 3]) assert.equal(ytStartBesluit({ ...basis, status, nu: 2500 }), "wacht");
assert.equal(ytStartBesluit({ ...basis, gespeeld: true, status: 2, nu: 2500 }), "wacht");
assert.equal(ytStartBesluit({ ...basis, actief: false, nu: 2500 }), "wacht");
assert.equal(ytStartBesluit({ ...basis, fout: true, nu: 2500 }), "wacht");
for (const code of [100, 101, 150, 152]) { assert.equal(ytEchteFout(code), true); assert.equal(autoplayGeblokkeerd("onError", code), false); }
for (const soort of ["onAutoplayBlocked", "NotAllowedError", "timeout"]) assert.equal(autoplayGeblokkeerd(soort), true);
assert.equal(autoplayGeblokkeerd("onError", 5), true);
assert.equal(geluidMag(true, true, false), true);
assert.equal(geluidMag(true, false, false), false);
assert.equal(geluidMag(true, true, true), false);
assert.equal(geluidMag(false, true, false), false);
assert.equal(ytStatusNaam(-1), "unstarted");

for (const code of [100, 101, 150, 152]) assert.equal(ytSkipBesluit(code, true, false, true), true);
assert.equal(ytSkipBesluit(5, true, false, true), false);
assert.equal(ytSkipBesluit(150, false, false, true), false);
assert.equal(ytSkipBesluit(150, true, true, true), false);
assert.equal(ytSkipBesluit(150, true, false, true), true);
assert.equal(ytSkipBesluit(150, true, false, false), false);
