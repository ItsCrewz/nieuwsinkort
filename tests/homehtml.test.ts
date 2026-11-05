import assert from "node:assert/strict";
import { homeNoscript } from "../src/homehtml";

const html = homeNoscript({ gegenereerd: "2026-11-05T12:00:00Z", dag_samenvatting: '<script> & "tekst"', items: Array.from({ length: 12 }, (_, i) => ({ kop: `Kop ${i} <nieuws>`, id: `0000000${i}` })) });
assert.ok(html.includes("&lt;script&gt; &amp; &quot;tekst&quot;"));
assert.ok(html.includes("Kop 0 &lt;nieuws&gt;"));
assert.ok(!html.includes("Kop 10"));
assert.equal(html.match(/href="\/bericht\//g)?.length, 10);
const leeg = homeNoscript();
assert.ok(leeg.includes('href="/vandaag"'));
assert.ok(leeg.includes('href="/over"'));
assert.ok(!leeg.includes("/bericht/"));
console.log("home zonder JavaScript: escaping, tien koppen en fallback geslaagd");
