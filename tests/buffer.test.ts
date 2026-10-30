import assert from "node:assert/strict";
import { niveauVan, planVoor } from "../src/buffer";

assert.equal(niveauVan(undefined), "ruim");
assert.equal(niveauVan({ type: "wifi" }), "ruim");
assert.equal(niveauVan({ type: "cellular" }), "zuinig");
assert.equal(niveauVan({ effectiveType: "3g" }), "zuinig");
for (const netwerk of [{ saveData: true }, { effectiveType: "2g" }, { effectiveType: "slow-2g" }]) {
  assert.equal(niveauVan(netwerk), "minimaal");
}
for (const niveau of ["ruim", "zuinig", "minimaal"] as const) {
  assert.deepEqual(planVoor(0, niveau), { secs: 30, bytes: 60e6 });
  assert.equal(planVoor(1, niveau).secs > 0, niveau !== "minimaal");
  for (const afstand of [-1, 2, 3, 4, 10]) assert.deepEqual(planVoor(afstand, niveau), { secs: 0, bytes: 0 });
}
assert.deepEqual(planVoor(1, "ruim"), { secs: 4, bytes: 1e6 });
assert.deepEqual(planVoor(1, "zuinig"), { secs: 2, bytes: 1e6 });
assert.deepEqual(planVoor(1, "minimaal"), { secs: 0, bytes: 0 });
console.log("buffer: tests geslaagd");
