// Regressie #762: een ongeldige kop of artikel-ID mag de sitemap niet onleesbaar maken.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { nieuwsSitemap } from "../../functions/sitemap-nieuws.xml";
import { artikelPad } from "../../src/artikelid";

const dag = "2026-11-04", t = Date.parse("2026-11-04T09:30:00Z");
const items = [
  { id: "ab\u0001\ud800cd&\"", kop: "Café & \"één\" <nieuws> '😀'\u0001\ud800\udfff\ud800\ufffe", t },
  { id: "abcdefgh", kop: "Overig nieuws", t },
];
const xml = nieuwsSitemap(items, dag);
const parser = spawnSync("python3", ["-c", `import json, sys, xml.etree.ElementTree as ET
root = ET.fromstring(sys.argv[1])
ns = {'s': 'http://www.sitemaps.org/schemas/sitemap/0.9', 'n': 'http://www.google.com/schemas/sitemap-news/0.9'}
print(json.dumps([[u.findtext('s:loc', namespaces=ns), u.findtext('n:news/n:title', namespaces=ns)] for u in root.findall('s:url', ns)], ensure_ascii=True))`, xml], { encoding: "utf8", timeout: 5000 });
assert.equal(parser.status, 0, parser.stderr);
assert.deepEqual(JSON.parse(parser.stdout), [
  [`https://nieuwsinkort.nl${artikelPad(items[0], dag).replaceAll("\u0001", "").replaceAll("\ud800", "")}`, "Café & \"één\" <nieuws> '😀'\ud800\udfff"],
  [`https://nieuwsinkort.nl${artikelPad(items[1], dag)}`, "Overig nieuws"],
]);
assert.ok(xml.includes("&amp;") && xml.includes("&quot;") && xml.includes("&apos;"));
