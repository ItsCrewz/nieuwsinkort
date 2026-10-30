// Draai: npm run test  (bundelt met esbuild en draait met node)
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { onRequestGet as dataGet } from "../functions/data.json";
import { slim } from "../functions/data.json";
import { neemVroegeData } from "../src/vroeg";

let n = 0;
const t = (name: string, fn: () => void | Promise<void>) => {
  const klaar = () => { n++; console.log("✓", name); };
  const resultaat = fn();
  if (resultaat instanceof Promise) return resultaat.then(klaar);
  klaar();
};

// #35: data.json zonder diagnosevelden, met ETag/304 en revalidatie
{
  const assets = { async fetch() { return Response.json({ items: [], filmpjes: [], dumpert: [], gegenereerd: "2020-01-01T00:00:00Z" }); } };
  const kv = { async get() { return null; } };
  const r1 = await dataGet({ request: new Request("https://test/data.json"), env: { ASSETS: assets, NIEUWS: kv } });
  const tag = r1.headers.get("ETag") || "";
  const r2 = await dataGet({ request: new Request("https://test/data.json", { headers: { "If-None-Match": tag } }), env: { ASSETS: assets, NIEUWS: kv } });
  const r3 = await dataGet({ request: new Request("https://test/data.json", { headers: { "If-None-Match": 'W/"anders"' } }), env: { ASSETS: assets, NIEUWS: kv } });
  const j = await r1.json();
  t("data.json: slim haalt diagnosevelden weg, ETag + 304, altijd hervalideren", () => {
    assert.deepEqual(slim({ a: 1, ontdubbeld: {}, routine_gegenereerd: "x" }), { a: 1 });
    assert.ok(!("ontdubbeld" in j) && !("routine_gegenereerd" in j));
    assert.match(tag, /^W\/"[0-9a-f]{40}"$/);
    assert.equal(r2.status, 304);
    assert.equal(r2.headers.get("ETag"), tag);
    assert.equal(r3.status, 200);
    assert.match(r1.headers.get("Cache-Control") || "", /max-age=0, must-revalidate/);
  });
  const hdr = readFileSync("public/_headers", "utf8");
  t("_headers: assets immutable, iconen en bronnen.json gecachet, CSP blijft", () => {
    assert.match(hdr, /\/assets\/\*\n\s+Cache-Control: public, max-age=31536000, immutable/);
    assert.match(hdr, /\/bronnen\.json\n\s+Cache-Control: .*stale-while-revalidate/);
    assert.match(hdr, /\/favicon\.svg\n\s+Cache-Control: .*max-age=86400/);
    assert.match(hdr, /Content-Security-Policy:/);
    assert.match(hdr, /\/fonts\/\*\n\s+Cache-Control: public, max-age=31536000, immutable/);
  });
  t("fonts: Inter self-hosted, geen Google Fonts, preload van het latin-gewicht, early fetch van data.json", () => {
    const html = readFileSync("index.html", "utf8"), css = readFileSync("src/index.css", "utf8");
    assert.ok(!/googleapis|gstatic/.test(html + css + hdr));
    assert.match(html, /rel="preload" href="\/fonts\/inter-latin\.woff2" as="font"[^>]*crossorigin/);
    for (const f of ["inter-latin", "inter-latin-ext"]) {
      assert.ok(readFileSync(`public/fonts/${f}.woff2`).subarray(0, 4).toString() === "wOF2", f);
      assert.match(css, new RegExp(`url\\(/fonts/${f}\\.woff2\\)`));
    }
    assert.match(css, /font-display:swap/);
    assert.match(html, /window\.__vroegData = fetch\("\/data\.json", \{ cache: "no-cache" \}\)/);
  });
  t("YouTube-thumbnails: preconnect met crossorigin staat in de head", () => {
    const html = readFileSync("index.html", "utf8");
    assert.match(html.split("</head>")[0], /<link rel="preconnect" href="https:\/\/i\.ytimg\.com" crossorigin\s*\/>/);
  });
  t("vroeg: neemVroegeData geeft de promise één keer terug", () => {
    const p = Promise.resolve(new Response("{}"));
    const w: any = { __vroegData: p };
    assert.equal(neemVroegeData(w), p);
    assert.equal(neemVroegeData(w), null);
  });
}

console.log(`\n${n} tests geslaagd`);
