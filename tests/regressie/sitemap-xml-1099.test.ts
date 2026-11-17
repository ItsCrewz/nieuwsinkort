// Regressie #1099: ongeldige XML-tekens in een kop breken de sitemap niet.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { nieuwsSitemap } from "../../functions/sitemap-nieuws.xml";

const t = Date.parse("2026-11-04T09:30:00Z");
const xml = nieuwsSitemap([
  { id: "abc&defg", kop: "Café & <nieuws> \"😀\"\u0000\u0001\u000b\ud800\ufffe\uffff", t },
  { id: "abcdefgh", kop: "Overig nieuws", t },
  { id: "ijklmnop", kop: "Ruw bericht", ruw: true, t },
  { id: "qrstuvwx", kop: "Zonder tijd" },
], "2026-11-04");

// Een echte XML-parser controleert ook of de hele sitemap leesbaar blijft.
const parser = spawnSync("python3", ["-c", `
import json, sys, xml.etree.ElementTree as ET
root = ET.fromstring(sys.argv[1])
ns = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9", "n": "http://www.google.com/schemas/sitemap-news/0.9"}
print(json.dumps([[u.findtext("s:loc", namespaces=ns), u.findtext("n:news/n:title", namespaces=ns), u.findtext("n:news/n:publication_date", namespaces=ns)] for u in root.findall("s:url", ns)]))
`, xml], { encoding: "utf8", timeout: 5000 });
assert.equal(parser.status, 0, parser.stderr);
const artikelen = JSON.parse(parser.stdout);
assert.equal(artikelen.length, 2);
assert.equal(artikelen[0][0], "https://nieuwsinkort.nl/bericht/2026-11-04/abc&defg-cafe-nieuws");
assert.equal(artikelen[0][1], 'Café & <nieuws> "😀"');
assert.equal(artikelen[0][2], "2026-11-04T09:30:00.000Z");
assert.equal(artikelen[1][1], "Overig nieuws");
assert.ok(xml.includes("abc&amp;defg"));
assert.ok(xml.includes("Café &amp; &lt;nieuws&gt; &quot;😀&quot;"));
