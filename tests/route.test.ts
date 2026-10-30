import assert from "node:assert/strict";
import { parseHash, viewHash } from "../src/route";

for (const hash of ["", "#/", "#/alles"]) {
  assert.deepEqual(parseHash(hash), { view: "alles", selected: null, video: null });
}
assert.deepEqual(parseHash("#/bericht/x"), { view: "alles", selected: "x", video: null });
assert.equal(viewHash("alles"), "#/");
assert.equal(parseHash("#/nederland").view, "nl");
assert.deepEqual(parseHash("#/filmpjes/x"), { view: "filmpjes", selected: null, video: "x" });
console.log("✓ Home-routes en bestaande rubriek- en videoroutes");
