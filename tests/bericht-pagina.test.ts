import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { artikelPad } from "../src/artikelid";
import { berichtHtml } from "../src/berichthtml";
import { onRequestGet } from "../functions/bericht/[[pad]]";
const sjabloon = readFileSync("index.html", "utf8");
const csp = /Content-Security-Policy: (.+)/.exec(readFileSync("public/_headers", "utf8"))![1]; // echte CSP: de pagina draait onder dezelfde hash als de app
const origineel = Date.now;
Date.now = () => Date.parse("2026-11-04T12:00:00Z");
try {
  const item = { kop: "Nieuws <script>", ai: "Een eigen samenvatting", samenvatting: "Meer nieuws", t: Date.now(), bronnen: [{ site: "Bron <script>", href: "https://bron.nl/a" }, { site: "kwaad", href: "javascript:alert(1)" }] };
  const dag = "2026-11-04", pad = artikelPad(item, dag), html = berichtHtml(sjabloon, item, dag);
  assert.ok(html.includes("&lt;script&gt;")); assert.ok(!html.includes("javascript:alert"));
  assert.ok(html.includes(`https://nieuwsinkort.nl${pad}`)); assert.ok(html.includes('property="og:image"'));
  const json = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/)![1]); assert.equal(json["@type"], "NewsArticle");
  const sjabloonMetTijd = sjabloon.replace("</head>", '<meta content="oud" property="article:published_time" /></head>');
  for (const t of [undefined, "ongeldig", ""]) {
    const zonderTijd = berichtHtml(sjabloonMetTijd, { ...item, t }, dag);
    assert.doesNotMatch(zonderTijd, /property="article:published_time"/);
    assert.match(zonderTijd, /property="og:title" content="Nieuws &lt;script&gt;"/);
    assert.match(zonderTijd, /name="twitter:description" content="Een eigen samenvatting"/);
  }
  for (const [t, verwacht] of [["2026-01-15T12:00:00+01:00", "2026-01-15T11:00:00.000Z"], ["2026-07-15T12:00:00+02:00", "2026-07-15T10:00:00.000Z"]]) {
    const metTijd = berichtHtml(sjabloonMetTijd, { ...item, t }, dag);
    assert.deepEqual([...metTijd.matchAll(/<meta property="article:published_time" content="([^"]*)"/g)].map((m) => m[1]), [verwacht]);
  }
  let reads = 0;
  const env = { ASSETS: { fetch: async (r: Request | string) => String((r as Request).url ?? r).endsWith("/data.json") ? Response.json({}) : new Response(sjabloon, { headers: { "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": csp } }) }, NIEUWS: { get: async () => { reads++; return `${dag}\ntag\n${JSON.stringify({ gegenereerd: new Date(Date.now()).toISOString(), items: [item] })}`; } } };
  const bezoek = (path: string) => onRequestGet({ request: new Request(`https://nieuwsinkort.nl${path}`), env, waitUntil: () => {} });
  let r = await bezoek(pad); assert.equal(r.status, 200); assert.equal(reads, 1);
  assert.ok(r.headers.get("content-security-policy")?.includes("default-src"));
  assert.ok((await r.clone().text()).includes('<div id="root"><article><h1>Nieuws &lt;script&gt;</h1>'), "de app-HTML met kop-tags en crawlertekst in #root");
  r = await bezoek(pad.replace(/nieuws-script$/, "anders")); assert.equal(r.status, 301); assert.equal(r.headers.get("location"), pad); assert.equal(r.headers.get("cache-control"), "no-store");
  r = await bezoek(`/bericht/${dag}/aaaaaaaa-onbekend`); assert.equal(r.status, 302); assert.equal(r.headers.get("cache-control"), "no-store");
  reads = 0; r = await bezoek("/bericht/2026-11-02/aaaaaaaa-oud"); assert.equal(r.status, 301); assert.equal(reads, 0);
  r = await bezoek("/bericht/2026-11-05/aaaaaaaa-toekomst"); assert.equal(r.status, 404);
} finally { Date.now = origineel; }
