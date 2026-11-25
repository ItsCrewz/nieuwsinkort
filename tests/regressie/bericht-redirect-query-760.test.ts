// #760: artikelredirects behouden ook de meetvoorkeur in een gedeelde link.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { artikelId, artikelPad, linkId } from "../../src/artikelid";
import { onRequestGet } from "../../functions/bericht/[[pad]]";

const echteNu = Date.now;
Date.now = () => Date.parse("2026-11-04T12:00:00Z");
try {
  const dag = "2026-11-04";
  const fixture = JSON.parse(readFileSync("public/data.json", "utf8"));
  const bron = fixture.items.find((i: any) => i.bronnen?.[0]?.href);
  assert.ok(bron);
  const item = { ...bron, id: linkId("https://voorbeeld.nl/ander-anker") };
  const canoniek = artikelPad(item, dag);
  const env = {
    NIEUWS: { get: async () => `${dag}\ntag\n${JSON.stringify({ gegenereerd: `${dag}T09:00:00Z`, items: [item] })}` },
    ASSETS: { fetch: async () => new Response("Niet beschikbaar", { status: 503 }) },
  };
  const bezoek = (pad: string) => onRequestGet({ request: new Request(`https://nieuwsinkort.nl${pad}`), env, waitUntil: () => {} });
  const query = "?nietmeten=1&a=b%20c&q=%C3%A9%26x";
  const slug = `${canoniek}-oud`;
  const alias = `/bericht/${dag}/${linkId(item.bronnen[0].href)}-oud`;
  for (const p of [slug, alias]) {
    for (const q of [query, ""]) {
      const r = await bezoek(`${p}${q}`);
      assert.equal(r.status, 301);
      assert.equal(r.headers.get("location"), `${canoniek}${q}`);
      assert.equal(r.headers.get("cache-control"), "no-store");
    }
  }
  for (const q of [query, "?q=%2F%2Fextern.example%2Fpad&volgende=https%3A%2F%2Fextern.example", ""]) {
    const r = await bezoek(`${canoniek}${q}`);
    assert.equal(r.status, 302);
    assert.equal(r.headers.get("location"), `/${q}#/bericht/${artikelId(item)}`);
    assert.equal(r.headers.get("cache-control"), "no-store");
    assert.equal(r.headers.get("x-robots-tag"), "noindex");
  }
  // Met sjabloon: een correcte link geeft direct 200 (geen redirect) en de canonical bevat nooit de bezoekersquery (#1442).
  const metSjabloon = { ...env, ASSETS: { fetch: async () => new Response('<html><head><title>x</title><link rel="canonical" href="https://nieuwsinkort.nl/" /></head><body></body></html>', { headers: { "Content-Type": "text/html" } }) } };
  const r = await onRequestGet({ request: new Request(`https://nieuwsinkort.nl${canoniek}${query}`), env: metSjabloon, waitUntil: () => {} });
  assert.equal(r.status, 200);
  const html = await r.text();
  assert.ok(html.includes(`<link rel="canonical" href="https://nieuwsinkort.nl${canoniek}" />`));
  assert.ok(!/canonical"[^>]*nietmeten/.test(html) && !html.includes(`og:url" content="https://nieuwsinkort.nl${canoniek}?`));
} finally { Date.now = echteNu; }
