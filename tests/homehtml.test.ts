import assert from "node:assert/strict";
import { homeNoscript } from "../src/homehtml";

const html = homeNoscript({ gegenereerd: "2026-11-05T12:00:00Z", dag_samenvatting: '<script> & "tekst"', items: Array.from({ length: 12 }, (_, i) => ({ kop: `Kop ${i} <nieuws>`, id: `0000000${i}`, bronnen: [{ href: `https://bron.example/nieuws/${i}` }] })) });
assert.ok(html.includes("&lt;script&gt; &amp; &quot;tekst&quot;"));
assert.ok(html.includes("Kop 0 &lt;nieuws&gt;"));
assert.ok(!html.includes("Kop 10"));
assert.equal(html.match(/href="https:\/\/bron\.example\/nieuws\/\d"/g)?.length, 10);
assert.ok(html.includes("<h2>In het kort</h2>"));
assert.ok(!html.includes("/bericht/"));
const zonderBron = homeNoscript({ gegenereerd: "2026-11-05T12:00:00Z", items: [{ kop: "A", id: "00000001", bronnen: [{ href: "javascript:alert(1)" }] }, { kop: "B", id: "00000002" }] });
assert.equal(zonderBron.match(/href="\/bericht\//g)?.length, 2);
assert.ok(!zonderBron.includes("javascript:"));
const leeg = homeNoscript();
assert.ok(leeg.includes('href="/vandaag"'));
assert.ok(leeg.includes('href="/over"'));
assert.ok(!leeg.includes("/bericht/"));
console.log("home zonder JavaScript: escaping, tien koppen en fallback geslaagd");
