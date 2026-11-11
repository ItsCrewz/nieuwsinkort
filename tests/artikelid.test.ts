import assert from "node:assert/strict";
import { artikelId, artikelPad, artikelSlug, linkId, parsePad } from "../src/artikelid";
const a = { kop: "Een café", bronnen: [{ href: "https://www.example.nl/a?utm_source=nieuws" }] };
assert.equal(artikelId(a), linkId("http://example.nl/a"));
assert.equal(artikelId({ ...a, id: linkId(a.bronnen[0].href), bronnen: [{ href: "https://example.nl/b" }] }), artikelId(a));
assert.equal(artikelSlug("Één café!"), "een-cafe");
assert.equal(artikelSlug("!!!"), "");
assert.equal(parsePad(artikelPad(a, "2026-11-04"))?.id, artikelId(a));
// #702: bronloze berichten zonder id krijgen geen (gedeelde) artikellink.
import { artikelUrl } from "../src/delen";
import { nieuwsSitemap } from "../functions/sitemap-nieuws.xml";
import { vandaagHtml } from "../functions/vandaag";
const b1 = { kop: "Eerste", cat: "nl", t: 1762300000000 }, b2 = { kop: "Tweede", cat: "nl", t: 1762300000000, bronnen: [] }, goed = { kop: "Goed", cat: "nl", t: 1762300000000, id: "abcd1234" };
assert.equal(artikelId(b1), ""); assert.equal(artikelId({ ...b2, bronnen: [{ href: "" }] }), "");
assert.equal(artikelPad(b1, "2026-11-04"), ""); assert.equal(artikelPad(b2, "2026-11-04"), "");
assert.equal(artikelPad(goed, "2026-11-04"), "/bericht/2026-11-04/abcd1234-goed");
assert.equal(artikelUrl(b1, "2026-11-04"), "https://nieuwsinkort.nl/");
assert.equal(artikelUrl(goed, "2026-11-04"), "https://nieuwsinkort.nl/bericht/2026-11-04/abcd1234-goed");
const xml = nieuwsSitemap([b1, b2, goed], "2026-11-04");
assert.equal((xml.match(/<url>/g) || []).length, 1); assert.ok(xml.includes("abcd1234-goed"));
const html = vandaagHtml([b1, b2, goed], "2026-11-04");
assert.ok(html.includes("<li>Eerste</li>") && html.includes("<li>Tweede</li>") && html.includes('href="/bericht/2026-11-04/abcd1234-goed"'));
assert.equal((html.match(/href="\/bericht\//g) || []).length, 1);
// Een expliciete id die gelijk is aan de hash van een lege tekst blijft een geldig artikel (sitemap en link).
const leeg = linkId("");
assert.equal(artikelPad({ id: leeg, kop: "x" }, "2026-11-04"), `/bericht/2026-11-04/${leeg}-x`);
assert.ok(nieuwsSitemap([{ id: leeg, kop: "x", cat: "nl", t: 1762300000000 }], "2026-11-04").includes(leeg));
