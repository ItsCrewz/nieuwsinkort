import assert from "node:assert/strict";
import { dagdata as oud, berekenBody as oudeBody } from "./fixtures/dagdata-main";
import { dagdata as nieuw } from "../src/dagdata";

// De fixture is de ongewijzigde implementatie van origin/main, met aangepaste importpaden.
const echteTijd = Date.now;
try {
  let tijd = Date.parse("2026-11-04T10:00:00Z");
  Date.now = () => tijd;
  const S = {
    gegenereerd: "2026-11-04T08:00:00Z", dag_samenvatting: "Routine",
    items: [{ titel: "Routinebericht", bronnen: [{ href: "https://nos.nl/routine", ft: "feedtitel" }] }],
    filmpjes: [], dumpert: [],
  };
  const H = {
    gegenereerd: "2026-11-04T09:00:00Z", dag_samenvatting: "Uur",
    items: [{ titel: "Nieuw bericht", bronnen: [{ href: "https://nos.nl/nieuw" }] }],
    // tijd "10:00" is bewust consistent met t, zodat oud en nieuw gelijk uitkomen; het verschil bij ontbrekende of tegenstrijdige tijd staat in data-merge.test.ts.
    filmpjes: [{ href: "https://video.test/1", tijd: "10:00", t: Date.parse("2026-11-04T09:00:00Z") }],
    dumpert: [], meta: { aiStand: "normaal" }, meerKeys: ["nos.nl/routine"],
  };
  const sv = { klaar: { video: { tekst: "Samenvatting" } } };
  const voorafBody = await oudeBody(S, H, sv);
  const waarden: Record<string, unknown> = { "data-vooraf": `2026-11-04\ntag\n${voorafBody}`, uur: H, "sv-klaar": sv };
  const gelezen: string[] = [];
  const env = {
    ASSETS: { fetch: async () => Response.json(S) },
    NIEUWS: { get: async (key: string, _opties: unknown) => { gelezen.push(key); return waarden[key] ?? null; } },
  };
  const vergelijk = async (naam: string, sleutels: string[]) => {
    const ctx = { request: new Request("https://site.test/data.json"), env };
    gelezen.length = 0;
    const a = await oud(ctx);
    assert.deepEqual(gelezen, sleutels, `${naam}: oude KV-reads`);
    gelezen.length = 0;
    const b = await nieuw(ctx);
    assert.deepEqual(gelezen, sleutels, `${naam}: nieuwe KV-reads`);
    assert.equal(b.status, a.status, naam);
    assert.equal(await b.text(), await a.text(), `${naam}: body`);
    assert.equal(b.headers.get("etag"), a.headers.get("etag"), `${naam}: ETag`);
    assert.ok(b.headers.get("etag"), `${naam}: ETag aanwezig`);
  };
  await vergelijk("normaal vooraf", ["data-vooraf"]);
  await vergelijk("normaal uit geheugen", ["data-vooraf"]);
  waarden["data-vooraf"] = null;
  await vergelijk("normale merge", ["data-vooraf", "uur", "sv-klaar"]);
  waarden.uur = null;
  await vergelijk("lege uurdata", ["data-vooraf", "uur", "sv-klaar"]);
  waarden.uur = H;
  waarden["data-vooraf"] = `2026-11-04\ntag\n${voorafBody}`;
  tijd = Date.parse("2026-11-04T22:59:50Z");
  await vergelijk("voor dagwissel", ["data-vooraf"]);
  tijd += 15_000;
  await vergelijk("na dagwissel", ["data-vooraf"]);
  waarden["data-vooraf"] = null;
  await vergelijk("dagwissel met oude uurdata", ["data-vooraf", "uur", "sv-klaar"]);
} finally {
  Date.now = echteTijd;
}
console.log("✓ oude en nieuwe dagdata: volledige paden, body en ETag");
