import assert from "node:assert/strict";
import { artikelId, artikelPad, artikelSlug, linkId, parsePad } from "../src/artikelid";
const a = { kop: "Een café", bronnen: [{ href: "https://www.example.nl/a?utm_source=feed" }] };
assert.equal(artikelId(a), linkId("http://example.nl/a"));
assert.equal(artikelId({ ...a, id: linkId(a.bronnen[0].href), bronnen: [{ href: "https://example.nl/b" }] }), artikelId(a));
assert.equal(artikelSlug("Één café!"), "een-cafe");
assert.equal(artikelSlug("!!!"), "");
assert.equal(parsePad(artikelPad(a, "2026-11-04"))?.id, artikelId(a));
for (const id of [12345678, null, {}, ["abcdefgh"], "ABCDEFGH", "abc1234", "abc123456", "abc-1234"]) {
  const item = { ...a, id };
  assert.equal(artikelId(item), linkId(a.bronnen[0].href));
  assert.equal(parsePad(artikelPad(item, "2026-11-04"))?.id, artikelId(item));
  assert.equal(artikelId({ id }), "");
}
assert.equal(artikelId({ id: "abc12345" }), "abc12345");
assert.equal(artikelPad({ kop: "Bronloos", id: "ONGELDIG" }, "2026-11-04"), "");
