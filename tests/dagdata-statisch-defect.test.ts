import assert from "node:assert/strict";
import { dagdata } from "../src/dagdata";

// #692: onleesbare statische data mag /data.json niet laten falen als de uurdata bruikbaar is.
const echteTijd = Date.now;
try {
  Date.now = () => Date.parse("2026-11-04T10:00:00Z");
  const S = { gegenereerd: "2026-11-04T08:00:00Z", items: [{ titel: "Routine", t: Date.parse("2026-11-04T07:30:00Z"), bronnen: [{ href: "https://nos.nl/r" }] }], filmpjes: [], dumpert: [] };
  const H = { gegenereerd: "2026-11-04T09:00:00Z", items: [{ titel: "Uur", t: Date.parse("2026-11-04T08:50:00Z"), bronnen: [{ href: "https://nos.nl/u" }] }], filmpjes: [], dumpert: [], meta: {} };
  const draai = async (stat: Response, uur: unknown) => {
    const gelezen: string[] = [];
    const env = {
      ASSETS: { fetch: async () => stat.clone() },
      NIEUWS: { get: async (k: string) => { gelezen.push(k); return k === "uur" ? uur : null; } },
    };
    const r = await dagdata({ request: new Request("https://site.test/data.json"), env });
    assert.ok(gelezen.every((k) => ["data-vooraf", "uur", "sv-klaar"].includes(k)), "alleen reads");
    return r;
  };
  const kapot = () => new Response("{niet-json");

  let r = await draai(kapot(), H);
  assert.equal(r.status, 200);
  let d: any = await r.json();
  assert.deepEqual(d.items.map((i: any) => i.titel), ["Uur"]);

  r = await draai(new Response("[]"), H);
  assert.equal(r.status, 200);

  for (const [stat, uur] of [[kapot(), null], [kapot(), { gegenereerd: "2026-11-03T09:00:00Z", items: [] }], [new Response("null"), null]] as const) {
    r = await draai(stat, uur);
    assert.equal(r.status, 503);
    assert.equal(r.headers.get("cache-control"), "no-store");
  }

  r = await draai(Response.json(S), H);
  d = await r.json();
  assert.deepEqual(d.items.map((i: any) => i.titel).sort(), ["Routine", "Uur"]);
} finally {
  Date.now = echteTijd;
}
console.log("✓ dagdata: defecte statische data valt terug op uurdata of 503");
