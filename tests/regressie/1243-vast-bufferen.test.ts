import { strict as assert } from "node:assert";
import { ytBufferBewaking } from "../../src/ytstart";

const b = ytBufferBewaking();
const meld = (status: number, nu: number, tijd?: number, actief = true, pauze = false) => b.meld(status, actief, pauze, nu, tijd);
assert.equal(meld(3, 0, 2), false);
assert.equal(meld(3, 9999, 2), false);
assert.equal(meld(3, 10000, 2), true);
assert.equal(meld(3, 10001, 3), false);
assert.equal(meld(3, 20001), true);
for (const status of [1, 2, 0, 5]) {
  assert.equal(meld(status, 20002), false);
  assert.equal(meld(3, 20003), false);
}
assert.equal(meld(3, 30003, undefined, true, true), false);
assert.equal(meld(3, 30004), false);
assert.equal(meld(3, 40004, undefined, false), false);
assert.equal(meld(3, 40005), false);
b.reset();
assert.equal(meld(3, 50005), false);
console.log("✓ langdurig bufferen biedt herstel en reset bij voortgang, pauze en wisselen");
