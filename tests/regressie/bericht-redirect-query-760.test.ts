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
  for (const q of [query, ""]) {
    const r = await bezoek(`${canoniek}${q}`);
    assert.equal(r.status, 302);
    assert.equal(r.headers.get("location"), `/${q}#/bericht/${artikelId(item)}`);
    assert.equal(r.headers.get("cache-control"), "no-store");
    assert.equal(r.headers.get("x-robots-tag"), "noindex");
  }
} finally { Date.now = echteNu; }
