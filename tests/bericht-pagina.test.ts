import assert from "node:assert/strict";
import { artikelPad } from "../src/artikelid";
import { berichtHtml, deelScript } from "../src/berichthtml";
import { onRequestGet } from "../functions/bericht/[[pad]]";
const origineel = Date.now;
Date.now = () => Date.parse("2026-11-04T12:00:00Z");
try {
  const item = { kop: "Nieuws <script>", ai: "Een eigen samenvatting", samenvatting: "Meer nieuws", t: Date.now(), bronnen: [{ site: "Bron <script>", href: "https://bron.nl/a" }, { site: "kwaad", href: "javascript:alert(1)" }] };
  const dag = "2026-11-04", pad = artikelPad(item, dag), html = berichtHtml(item, dag);
  assert.ok(html.includes("&lt;script&gt;")); assert.ok(!html.includes("javascript:alert"));
  assert.ok(html.includes(`https://nieuwsinkort.nl${pad}`)); assert.ok(html.includes('property="og:image"'));
  const json = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/)![1]); assert.equal(json["@type"], "NewsArticle");
  let reads = 0;
  const env = { ASSETS: { fetch: async () => Response.json({}) }, NIEUWS: { get: async () => { reads++; return `${dag}\ntag\n${JSON.stringify({ gegenereerd: new Date(Date.now()).toISOString(), items: [item] })}`; } } };
  const bezoek = (path: string) => onRequestGet({ request: new Request(`https://nieuwsinkort.nl${path}`), env, waitUntil: () => {} });
  let r = await bezoek(pad); assert.equal(r.status, 200); assert.equal(reads, 1);
  const hash = Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(deelScript))).toString("base64"); assert.ok(r.headers.get("content-security-policy")?.includes(hash));
  r = await bezoek(pad.replace(/nieuws-script$/, "anders")); assert.equal(r.status, 301); assert.equal(r.headers.get("location"), pad); assert.equal(r.headers.get("cache-control"), "no-store");
  r = await bezoek(`/bericht/${dag}/aaaaaaaa-onbekend`); assert.equal(r.status, 302); assert.equal(r.headers.get("cache-control"), "no-store");
  reads = 0; r = await bezoek("/bericht/2026-11-02/aaaaaaaa-oud"); assert.equal(r.status, 301); assert.equal(reads, 0);
  r = await bezoek("/bericht/2026-11-05/aaaaaaaa-toekomst"); assert.equal(r.status, 404);
} finally { Date.now = origineel; }
