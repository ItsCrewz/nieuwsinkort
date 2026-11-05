// De statische startpagina bevat geen nieuws dat na de build kan verouderen.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
// @ts-ignore buildscript is JS
import { metNoscript, noscriptHtml } from "../scripts/noscript-html.mjs";

const stat = JSON.parse(readFileSync("public/data.json", "utf8"));
const html = noscriptHtml(stat);
assert.match(html, /<h1>Nieuws in het kort<\/h1>/);
assert.match(html, /href="\/vandaag"/);
assert.match(html, /href="\/over"/);
assert.doesNotMatch(html, /<li>|<ul>/);
if (stat.dag_samenvatting) assert.ok(!html.includes(stat.dag_samenvatting));
for (const item of stat.items) if (item.kop) assert.ok(!html.includes(item.kop));
const index = readFileSync("index.html", "utf8");
assert.ok(index.includes(`<noscript>${html}</noscript>`));
const gevuld = metNoscript(index, "<p>$&</p>");
assert.ok(gevuld.includes("<noscript><p>$&</p></noscript>") && gevuld.includes('<div id="root"></div>'));
