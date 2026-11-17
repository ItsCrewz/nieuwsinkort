import assert from "node:assert/strict";
import { etagMatch } from "../src/etagmatch";

assert.equal(etagMatch(null, '"abc"'), false);
assert.equal(etagMatch('"abc"', null), false);
assert.equal(etagMatch("", '"abc"'), false);
assert.equal(etagMatch('"abc"', ""), false);

assert.equal(etagMatch(" * ", '"abc"'), true);
assert.equal(etagMatch("*", null), false);
assert.equal(etagMatch('*, "ander"', '"abc"'), false);

for (const kop of ['"abc"', 'W/"abc"']) {
  for (const tag of ['"abc"', 'W/"abc"', ' W/"abc" ']) {
    assert.equal(etagMatch(kop, tag), true, `${kop} tegenover ${tag}`);
  }
}
assert.equal(etagMatch('"abc"', '"ABC"'), false);
assert.equal(etagMatch('"abc"', '"abcd"'), false);

assert.equal(etagMatch('"eerste", W/"abc", "laatste"', '"abc"'), true);
assert.equal(etagMatch('"eerste", "laatste"', '"abc"'), false);
assert.equal(etagMatch('"a,b", "laatste"', 'W/"a,b"'), true);
assert.equal(etagMatch('""', 'W/""'), true);

assert.equal(etagMatch("geen tag", '"abc"'), false);
assert.equal(etagMatch('"onafgesloten', '"abc"'), false);
assert.equal(etagMatch('tekst "abc" tekst', '"abc"'), true);
assert.equal(etagMatch('w/"abc"', '"abc"'), true);
assert.equal(etagMatch('"abc"', 'w/"abc"'), false);

console.log("✓ etagMatch: zwakke vergelijking, lijsten en randgevallen");
