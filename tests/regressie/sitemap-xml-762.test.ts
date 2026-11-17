// Regressie #762: een ongeldige kop of artikel-ID mag de sitemap niet onleesbaar maken.
import assert from "node:assert/strict";
import { nieuwsSitemap } from "../../functions/sitemap-nieuws.xml";
import { artikelPad } from "../../src/artikelid";

const dag = "2026-11-04", t = Date.parse("2026-11-04T09:30:00Z");
const items = [
  { id: "ab\u0001\ud800cd&\"", kop: "Café & \"één\" <nieuws> '😀'\u0001\ud800\udfff\ud800\ufffe", t },
  { id: "abcdefgh", kop: "Overig nieuws", t },
];
const xml = nieuwsSitemap(items, dag);
const pad = artikelPad(items[0], dag).replaceAll("\u0001", "").replaceAll("\ud800", "").replaceAll("&", "&amp;").replaceAll('"', "&quot;");
const regel = (loc: string, titel: string) => `<url><loc>https://nieuwsinkort.nl${loc}</loc><news:news><news:publication><news:name>Nieuws in het kort</news:name><news:language>nl</news:language></news:publication><news:publication_date>2026-11-04T09:30:00.000Z</news:publication_date><news:title>${titel}</news:title></news:news></url>`;
assert.equal(xml, `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">${regel(pad, "Café &amp; &quot;één&quot; &lt;nieuws&gt; &apos;😀&apos;\ud800\udfff")}${regel(artikelPad(items[1], dag), "Overig nieuws")}</urlset>\n`);
