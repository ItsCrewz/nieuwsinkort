import assert from "node:assert/strict";
import { ytBufferBewaking, ytStartBesluit } from "../../src/ytstart";

// Een actieve speler blijft bufferen, ook na eerdere afspeelvoortgang.
const tik = ytBufferBewaking();
assert.equal(tik(true, 3, 12, 0), false);
assert.equal(tik(true, 3, 12, 9999), false);
assert.equal(tik(true, 3, 12, 10000), true);
assert.equal(tik(true, 3, 13, 10001), false);
assert.equal(tik(true, 3, 13, 20001), true);
for (const status of [1, 2, 0, -1, 5, null]) {
  assert.equal(tik(true, status, 13, 20002), false);
  assert.equal(tik(true, 3, 13, 20003), false);
}
assert.equal(tik(false, 3, 13, 40000), false);
assert.equal(tik(true, 3, 13, 40001), false);
assert.equal(ytStartBesluit({ actief: true, gepauzeerd: false, klaar: true, status: 3, pogingen: 3, sinds: 0, nu: 40000, gespeeld: true }), "wacht");
