import assert from "node:assert/strict";
import { artikelId, artikelPad, artikelSlug, linkId, parsePad } from "../src/artikelid";
const a = { kop: "Een café", bronnen: [{ href: "https://www.example.nl/a?utm_source=feed" }] };
assert.equal(artikelId(a), linkId("http://example.nl/a"));
assert.equal(artikelId({ ...a, id: linkId(a.bronnen[0].href), bronnen: [{ href: "https://example.nl/b" }] }), artikelId(a));
assert.equal(artikelSlug("Één café!"), "een-cafe");
assert.equal(artikelSlug("!!!"), "");
assert.equal(parsePad(artikelPad(a, "2026-11-04"))?.id, artikelId(a));
