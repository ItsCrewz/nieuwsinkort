import assert from "node:assert/strict";
import { host } from "../src/ui";

assert.equal(host("https://voorbeeld.nl/artikel?bron=test"), "voorbeeld.nl");
assert.equal(host("https://www.voorbeeld.nl/artikel"), "voorbeeld.nl");
assert.equal(host("https://nieuws.voorbeeld.nl/artikel"), "nieuws.voorbeeld.nl");
assert.equal(host("https://www.nieuws.voorbeeld.nl/artikel"), "nieuws.voorbeeld.nl");
assert.equal(host("geen geldige url"), "geen geldige url");
assert.equal(host("/artikel/123"), "/artikel/123");
console.log("host: URL-tests geslaagd");