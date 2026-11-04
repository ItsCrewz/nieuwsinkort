// Startpagina zonder JavaScript (#313): <noscript> bevat dagsamenvatting en 10 koppen met bronlink uit data.json; escaping, $-patronen, terugval; geen netwerk.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { metNoscript, noscriptHtml, onRequestGet } from "../functions/index";

const origineel = Date.now;
Date.now = () => Date.parse("2026-11-04T12:00:00Z");
try {
  const items = Array.from({ length: 12 }, (_, n) => ({ kop: `Kop ${n + 1}`, bronnen: [{ site: "NOS", href: `https://nos.nl/a${n + 1}` }] }));
  const html = noscriptHtml({ dag_samenvatting: "Samen <b>vat</b> $& ting", items });
  assert.equal((html.match(/<li>/g) || []).length, 10, "10 koppen");
  assert.ok(html.includes('<a href="https://nos.nl/a1">Kop 1</a> (NOS)') && !html.includes("Kop 11"));
  assert.ok(html.includes("Samen &lt;b&gt;vat&lt;/b&gt; $&amp; ting"), "samenvatting geëscaped");
  assert.ok(html.includes('<a href="/vandaag">'), "link naar /vandaag blijft");
  const gevaarlijk = noscriptHtml({ items: [{ kop: "X", bronnen: [{ href: "javascript:alert(1)" }] }, { kop: "" }] });
  assert.ok(!gevaarlijk.includes("javascript:") && gevaarlijk.includes("<li>X</li>") && (gevaarlijk.match(/<li>/g) || []).length === 1);
  assert.ok(!noscriptHtml(null).includes("<ul>"), "zonder data geen lijst");

  const index = readFileSync("index.html", "utf8");
  const gevuld = metNoscript(index, "<p>$&</p>");
  assert.ok(gevuld.includes("<noscript><p>$&</p></noscript>") && gevuld.includes('<div id="root"></div>'));

  const dag = "2026-11-04";
  const data = { gegenereerd: "2026-11-04T10:00:00Z", dag_samenvatting: "Dagnieuws", items };
  const env = { ASSETS: { fetch: async () => new Response(index, { headers: { "Content-Type": "text/html; charset=utf-8", ETag: '"x"' } }) }, NIEUWS: { get: async () => `${dag}\ntag\n${JSON.stringify(data)}` } };
  let r = await onRequestGet({ request: new Request("https://nieuwsinkort.nl/"), env, waitUntil: () => {} });
  const tekst = await r.text();
  assert.equal(r.status, 200); assert.equal(r.headers.get("etag"), null);
  assert.equal((tekst.match(/<li>/g) || []).length, 10); assert.ok(tekst.includes("Dagnieuws"));
  // data niet beschikbaar: kale pagina met /vandaag-link
  r = await onRequestGet({ request: new Request("https://nieuwsinkort.nl/"), env: { ...env, NIEUWS: { get: async () => { throw new Error("kv"); } }, ASSETS: { fetch: async (q: any) => String(q.url ?? q).endsWith("/data.json") ? new Response("", { status: 500 }) : new Response(index, { headers: { "Content-Type": "text/html" } }) } }, waitUntil: () => {} });
  assert.equal(r.status, 200); assert.ok((await r.text()).includes('<a href="/vandaag">'));
  // asset-fout wordt doorgegeven
  r = await onRequestGet({ request: new Request("https://nieuwsinkort.nl/"), env: { ASSETS: { fetch: async () => new Response("", { status: 404 }) } }, waitUntil: () => {} });
  assert.equal(r.status, 404);
} finally { Date.now = origineel; }
