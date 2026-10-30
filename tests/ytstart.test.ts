import assert from "node:assert/strict";
import { ytStartBesluit, ytStatusNaam } from "../src/ytstart";

const basis = { actief: true, gepauzeerd: false, klaar: true, status: null, pogingen: 0, sinds: 1000, nu: 2000 };
assert.equal(ytStartBesluit({ ...basis, nu: 1999 }), "wacht");
assert.equal(ytStartBesluit(basis), "probeer");
assert.equal(ytStartBesluit({ ...basis, status: -1 }), "probeer");
assert.equal(ytStartBesluit({ ...basis, status: 5 }), "probeer");
assert.equal(ytStartBesluit({ ...basis, pogingen: 2 }), "probeer");
assert.equal(ytStartBesluit({ ...basis, pogingen: 3 }), "vangnet");
assert.equal(ytStartBesluit({ ...basis, actief: false, pogingen: 3 }), "wacht");
assert.equal(ytStartBesluit({ ...basis, gepauzeerd: true, pogingen: 3 }), "wacht");
for (const status of [0, 1, 2, 3]) assert.equal(ytStartBesluit({ ...basis, status }), "wacht");
assert.equal(ytStartBesluit({ ...basis, klaar: false, nu: 3499 }), "wacht");
assert.equal(ytStartBesluit({ ...basis, klaar: false, nu: 3500 }), "vangnet");
assert.equal(ytStartBesluit({ ...basis, klaar: false, actief: false, nu: 5000 }), "wacht");
assert.equal(ytStartBesluit({ ...basis, klaar: false, gepauzeerd: true, nu: 5000 }), "wacht");
for (const [status, naam] of [[-1, "unstarted"], [0, "ended"], [1, "playing"], [2, "paused"], [3, "buffering"], [5, "cued"], [null, "onbekend"]] as const) {
  assert.equal(ytStatusNaam(status), naam);
}