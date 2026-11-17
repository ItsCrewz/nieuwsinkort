import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dagdata } from "../../src/dagdata";

// #692: een defect statisch item mag geldige uurdata niet wegdrukken.
const item = JSON.parse(readFileSync("tests/regressie/fixtures/artikel-bronnen-829.json", "utf8"));
const echteTijd = Date.now;
try {
  Date.now = () => Date.parse("2026-11-04T10:00:00Z");
  const gegenereerd = "2026-11-04T09:00:00Z";
  const statisch = { gegenereerd, items: [{ ...item, bronnen: "defect" }] };
  const uur = { gegenereerd, items: [{ ...item, t: Date.now() }, { ...item, t: Date.parse("2026-11-03T09:00:00Z") }] };
  const env = {
    ASSETS: { fetch: async () => Response.json(statisch) },
    NIEUWS: { get: async (key: string) => key === "uur" ? uur : null },
  };
  const antwoord = await dagdata({ request: new Request("https://site.test/data.json"), env });
  assert.equal(antwoord.status, 200);
  const data: any = await antwoord.json();
  assert.equal(data.items.length, 1);
  assert.equal(data.items[0].kop, item.kop);
  assert.ok(Array.isArray(data.items[0].bronnen));
} finally {
  Date.now = echteTijd;
}
console.log("✓ dagdata: defect statisch item valt terug op gefilterde uurdata");
