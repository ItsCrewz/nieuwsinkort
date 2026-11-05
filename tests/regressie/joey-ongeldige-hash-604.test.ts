import assert from "node:assert/strict";
import { parseHash } from "../../src/route";

const home = { view: "alles", selected: null, video: null };
for (const hash of ["#/%", "#/bericht/%ZZ", "#/filmpjes/%E0%A4", "#/dumpert/%C3"]) {
  assert.deepEqual(parseHash(hash), home, hash);
}
assert.deepEqual(parseHash("#/bericht/caf%C3%A9"), { view: "alles", selected: "café", video: null });
assert.deepEqual(parseHash("#/filmpjes/caf%C3%A9"), { view: "filmpjes", selected: null, video: "café" });
assert.deepEqual(parseHash("#/dumpert/a%2Fb"), { view: "dumpert", selected: null, video: "a/b" });
