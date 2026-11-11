// /vandaag: links naar dezelfde berichtpagina's, escaping, filters, lege dag en noscript-link; vaste klok, mocks, geen netwerk.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { artikelPad } from "../src/artikelid";
import { onRequestGet, vandaagHtml } from "../functions/vandaag";

const origineel = Date.now;
Date.now = () => Date.parse("2026-11-04T12:00:00Z");
try {
  const dag = "2026-11-04";
  const a = { kop: "Rook & <vuur>", cat: "nl", bronnen: [{ href: "https://nos.nl/a" }] };
  const b = { kop: "Wereldnieuws", cat: "buitenland", bronnen: [{ href: "https://nos.nl/b" }] };
  const ruw = { kop: "Ruw", cat: "nl", ruw: true, bronnen: [{ href: "https://nos.nl/r" }] };
  const pol = { kop: "Partij", cat: "politiek", bronnen: [{ href: "https://nos.nl/p" }] };
  const html = vandaagHtml([a, b, ruw, pol], dag);
  assert.ok(html.includes(`<a href="${artikelPad(a, dag)}">Rook &amp; &lt;vuur&gt;</a>`), "link = artikelpad, kop escaped");
  assert.ok(html.includes("<h1>Nieuws van vandaag</h1>") && html.includes("<h2>Nederland</h2>") && html.includes("<h2>Buitenland</h2>"));
  assert.ok(!html.includes("Ruw") && !html.includes("Partij"), "ruw en politiek niet");
  assert.ok(vandaagHtml([], dag).includes("nog geen berichten"), "lege dag");
  assert.equal((html.match(/<link rel="canonical"/g) || []).length, 1);

  const env = { ASSETS: { fetch: async () => Response.json({}) }, NIEUWS: { get: async () => `${dag}\ntag\n${JSON.stringify({ gegenereerd: "2026-11-04T10:00:00Z", items: [a] })}` } };
  let r = await onRequestGet({ request: new Request("https://nieuwsinkort.nl/vandaag?x=1"), env, waitUntil: () => {} });
  assert.equal(r.status, 200); assert.equal(r.headers.get("x-content-type-options"), "nosniff"); assert.equal(r.headers.get("strict-transport-security"), "max-age=86400");
  assert.ok(!r.headers.get("content-security-policy")!.includes("script-src") && r.headers.get("content-security-policy")!.includes("default-src 'none'"), "geen scripts toegestaan");
  assert.ok((await r.text()).includes(artikelPad(a, dag)));
  r = await onRequestGet({ request: new Request("https://nieuwsinkort.nl/vandaag"), env: { ASSETS: { fetch: async () => new Response("", { status: 500 }) }, NIEUWS: { get: async () => null } }, waitUntil: () => {} });
  assert.equal(r.status, 503); assert.equal(r.headers.get("cache-control"), "no-store");

  assert.ok(readFileSync("index.html", "utf8").includes('<a href="/vandaag">'), "noscript linkt naar /vandaag");
} finally { Date.now = origineel; }
