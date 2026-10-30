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

// Randgevallen (huidig gedrag vastgelegd)
const leeg = { view: "alles", selected: null, video: null };
for (const hash of ["#", "#/", "/", "#//", "   "]) assert.deepEqual(parseHash(hash), leeg);
// Onbekende tab, oude routes en hoofdlettergevoeligheid vallen terug op alles
for (const hash of ["#/bestaat-niet", "#/Nederland", "#/nl", "#/nieuws", "#/oud/pad", "#/nederland/extra", "#/filmpjes-x", "#/bericht", "#/Bericht/x"]) {
  assert.deepEqual(parseHash(hash), leeg, hash);
}
// Slug zonder # of met enkele slash werkt ook
assert.equal(parseHash("nederland").view, "nl");
assert.equal(parseHash("#nederland").view, "nl");
assert.equal(parseHash("#/formule-1").view, "f1");
// Video's en berichten
assert.deepEqual(parseHash("#/filmpjes"), { view: "filmpjes", selected: null, video: null });
assert.deepEqual(parseHash("#/dumpert"), { view: "dumpert", selected: null, video: null });
assert.deepEqual(parseHash("#/dumpert/"), leeg);
assert.deepEqual(parseHash("#/dumpert/a/b"), { view: "dumpert", selected: null, video: "a/b" });
assert.deepEqual(parseHash("#/bericht/"), { view: "alles", selected: "", video: null });
assert.deepEqual(parseHash("#/bericht/a%20b"), { view: "alles", selected: "a b", video: null });
assert.equal(parseHash("#/bericht/a/b").selected, "a/b");
// Ongeldige percent-codering gooit nu een URIError
assert.throws(() => parseHash("#/bericht/%E0%A4%A"), URIError);
// viewHash
assert.equal(viewHash("nl"), "#/nederland");
assert.equal(viewHash("f1"), "#/formule-1");
assert.equal(viewHash("filmpjes"), "#/filmpjes");
assert.equal(viewHash("dumpert"), "#/dumpert");
for (const v of ["nl", "f1", "tech", "filmpjes", "dumpert"] as const) assert.equal(parseHash(viewHash(v)).view, v);
console.log("✓ Route-randgevallen");
