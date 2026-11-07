// Favicon en site-icoon (#597): tags in index.html, over.html en de gerenderde /vandaag-HTML; bestanden bestaan met de juiste pixelmaten.
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { vandaagHtml } from "../functions/vandaag";
import { onRequestGet as bericht } from "../functions/bericht/[[pad]]";
import { artikelPad } from "../src/artikelid";
import { ICOON_TAGS } from "../src/icoontags";

const t = async (naam: string, f: () => void | Promise<void>) => { await f(); console.log(`✓ ${naam}`); };
const png = (pad: string) => { const b = readFileSync(pad); assert.equal(b.subarray(1, 4).toString(), "PNG", pad); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
const TAGS = ['rel="icon" href="/favicon.ico" sizes="48x48"', 'rel="icon" type="image/svg+xml" href="/favicon.svg"', 'rel="icon" type="image/png" sizes="96x96" href="/icon-96.png"', 'rel="apple-touch-icon" href="/apple-touch-icon.png"', 'rel="manifest" href="/manifest.webmanifest"'];
const heeftTags = (html: string) => TAGS.forEach((x) => assert.ok(html.replace(/ \/>/g, ">").includes(x) || html.replace(/ \/>/g, ">").replace(/ +/g, " ").includes(x), x));

await t("alle icoon-tags staan in index.html, over.html en /vandaag", () => {
  for (const p of ["index.html", "public/over.html"]) heeftTags(readFileSync(p, "utf8"));
  heeftTags(vandaagHtml([], "2026-11-05"));
  heeftTags(ICOON_TAGS);
});

await t("de gerenderde /bericht-pagina behoudt alle icoon-tags uit het indexsjabloon", async () => {
  const echt = Date.now; Date.now = () => Date.parse("2026-11-04T12:00:00Z");
  try {
    const sjabloon = readFileSync("index.html", "utf8"), dag = "2026-11-04";
    const item = { kop: "Icoontest voor bericht", ai: "Een samenvatting", samenvatting: "Meer", t: Date.now(), bronnen: [{ site: "Bron", href: "https://bron.nl/a" }] };
    const env = { ASSETS: { fetch: async () => new Response(sjabloon, { headers: { "Content-Type": "text/html; charset=utf-8" } }) }, NIEUWS: { get: async () => `${dag}\ntag\n${JSON.stringify({ gegenereerd: new Date(Date.now()).toISOString(), items: [item] })}` } };
    const r = await bericht({ request: new Request(`https://nieuwsinkort.nl${artikelPad(item, dag)}`), env, waitUntil: () => {} });
    assert.equal(r.status, 200);
    heeftTags(await r.text());
  } finally { Date.now = echt; }
});

await t("icoonbestanden hebben de juiste pixelmaten", () => {
  for (const [f, n] of [["icon-48", 48], ["icon-96", 96], ["icon-192", 192], ["icon-512", 512], ["icon-maskable-512", 512], ["apple-touch-icon", 180]] as const) assert.deepEqual(png(`public/${f}.png`), [n, n], f);
  assert.match(readFileSync("public/favicon.svg", "utf8"), /^<svg[^>]+viewBox="0 0 64 64"/);
});

await t("favicon.ico bevat 16, 32 en 48 px en blijft klein", () => {
  const b = readFileSync("public/favicon.ico");
  assert.equal(b.readUInt16LE(2), 1);
  const maten = Array.from({ length: b.readUInt16LE(4) }, (_, i) => b[6 + i * 16]);
  assert.deepEqual(maten, [16, 32, 48]);
  assert.ok(b.length <= 15 * 1024);
  for (const f of ["icon-48", "icon-96", "icon-192", "icon-512", "icon-maskable-512", "apple-touch-icon"]) assert.ok(statSync(`public/${f}.png`).size < 12 * 1024, f);
});

await t("manifest verwijst naar bestaande iconen, incl. maskable", () => {
  const m = JSON.parse(readFileSync("public/manifest.webmanifest", "utf8"));
  for (const i of m.icons) { const [w] = png(`public${i.src}`); assert.equal(`${w}x${w}`, i.sizes); }
  assert.ok(m.icons.some((i: any) => i.sizes === "192x192"));
  assert.ok(m.icons.some((i: any) => i.sizes === "512x512" && i.purpose === "any"));
  assert.ok(m.icons.some((i: any) => i.purpose === "maskable"));
});

await t("iconen krijgen cache-headers, geen noindex en geen redirect", () => {
  const h = readFileSync("public/_headers", "utf8"), r = readFileSync("public/robots.txt", "utf8");
  for (const p of ["/favicon.ico", "/icon-48.png", "/icon-96.png", "/icon-maskable-512.png"]) assert.ok(h.includes(`${p}\n  Cache-Control:`), p);
  assert.ok(!/noindex/i.test(h));
  assert.ok(!/Disallow:\s*\/(favicon|icon|apple)/i.test(r));
  assert.ok(!existsRedirect());
});
function existsRedirect() { try { return /favicon|icon-/.test(readFileSync("public/_redirects", "utf8")); } catch { return false; } }
