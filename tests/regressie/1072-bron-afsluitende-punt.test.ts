import assert from "node:assert/strict";
import { hostVan, isNL } from "../../src/bronlink";

for (const href of ["https://voorbeeld.nl/artikel", "https://voorbeeld.nl./artikel", "https://VOORBEELD.NL./artikel"]) {
  assert.equal(hostVan(href), "voorbeeld.nl");
  assert.equal(isNL({ c: [{ href }] }), true);
}
assert.equal(isNL({ c: [{ href: "https://voorbeeld.com./artikel" }] }), false);
assert.equal(isNL({ c: [{ href: "/ongeldig" }, { href: "https://voorbeeld.nl./artikel" }] }), true);
assert.equal(isNL({ c: [{ href: "ongeldig" }] }), false);
