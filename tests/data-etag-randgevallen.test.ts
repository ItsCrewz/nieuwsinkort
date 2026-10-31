// Draai: npm test  (randgevallen voor slim() en ETag/304 in functions/data.json.ts)
import assert from "node:assert/strict";
import { onRequestGet as data, slim } from "../functions/data.json";

let n = 0;
const t = async (name: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log("✓", name); };

// Vaste klok: 30 oktober 2026, 12:00 Amsterdamse tijd.
const NU = Date.parse("2026-10-30T11:00:00Z");
const origineel = Date.now;
Date.now = () => NU;

const statisch = {
  gegenereerd: "2026-10-30T07:00:00Z",
  datum: "vrijdag 30 oktober",
  items: [{ titel: "Ochtendbericht", t: Date.parse("2026-10-30T06:30:00Z"), bronnen: [{ href: "https://nos.nl/a" }] }],
  filmpjes: [],
  dumpert: [],
  ontdubbeld: 3,
};
const maakEnv = (inhoud: Record<string, any>, opties: { assetStatus?: number } = {}) => {
  const kvLeest: string[] = [];
  const assetsVragen: string[] = [];
  const env = {
    NIEUWS: { async get(key: string, _type: "json") { kvLeest.push(key); return inhoud[key] ?? null; } },
    ASSETS: {
      async fetch(req: Request | string) {
        assetsVragen.push(typeof req === "string" ? req : req.url);
        const status = opties.assetStatus ?? 200;
        return status === 200 ? Response.json(statisch) : new Response("weg", { status });
      },
    },
  };
  return { env, kvLeest, assetsVragen };
};
const req = (pad: string, init?: RequestInit) => new Request(`https://nieuws.example${pad}`, init);

try {
  await t("slim laat null, undefined en niet-objecten ongemoeid", () => {
    assert.equal(slim(null), null);
    assert.equal(slim(undefined), undefined);
    assert.equal(slim(0), 0);
    assert.equal(slim(""), "");
    assert.equal(slim("tekst"), "tekst");
    assert.equal(slim(false), false);
  });

  await t("slim verwijdert ontdubbeld, routine_gegenereerd en oud, rest blijft", () => {
    const invoer = { ontdubbeld: 4, routine_gegenereerd: "2026-10-30T07:00:00Z", oud: { items: 1 }, items: [1], gegenereerd: "x", uur: { nieuw: 2 } };
    const uit = slim(invoer);
    assert.deepEqual(uit, { items: [1], gegenereerd: "x", uur: { nieuw: 2 } });
    assert.ok("ontdubbeld" in invoer, "invoer niet muteren");
  });

  await t("slim verwijdert ook diagnosevelden met valse waarden", () => {
    assert.deepEqual(slim({ ontdubbeld: 0, routine_gegenereerd: null, oud: undefined, a: 1 }), { a: 1 });
  });

  await t("slim op object zonder diagnosevelden geeft een gelijke kopie", () => {
    const invoer = { a: 1, b: [2] };
    const uit = slim(invoer);
    assert.deepEqual(uit, invoer);
    assert.notEqual(uit, invoer);
  });

  await t("slim behandelt een array als object (geen diagnosevelden, wel object)", () => {
    assert.deepEqual(slim([1, 2]), { 0: 1, 1: 2 });
  });

  await t("respons bevat geen diagnosevelden", async () => {
    const { env } = maakEnv({});
    const body: any = await (await data({ request: req("/data.json"), env })).json();
    assert.equal(body.ontdubbeld, undefined);
    assert.equal(body.oud, undefined);
    assert.equal(body.routine_gegenereerd, undefined);
    assert.equal(body.items.length, 1);
  });

  await t("gelijke body geeft dezelfde zwakke ETag", async () => {
    const { env } = maakEnv({});
    const r1 = await data({ request: req("/data.json"), env });
    const r2 = await data({ request: req("/data.json"), env });
    const e1 = r1.headers.get("etag"), e2 = r2.headers.get("etag");
    assert.match(e1 || "", /^W\/"[0-9a-f]{40}"$/);
    assert.equal(e1, e2);
    assert.equal(await r1.text(), await r2.text());
  });

  await t("andere body geeft een andere ETag", async () => {
    const a = maakEnv({});
    const b = maakEnv({ "sv-klaar": { klaar: { v: { punten: ["Punt"] } } } });
    const ea = (await data({ request: req("/data.json"), env: a.env })).headers.get("etag");
    const eb = (await data({ request: req("/data.json"), env: b.env })).headers.get("etag");
    assert.ok(ea && eb);
    assert.notEqual(ea, eb);
  });

  await t("If-None-Match met de ETag geeft 304 zonder body, met ETag en headers", async () => {
    const { env } = maakEnv({});
    const tag = (await data({ request: req("/data.json"), env })).headers.get("etag")!;
    const r = await data({ request: req("/data.json", { headers: { "If-None-Match": tag } }), env });
    assert.equal(r.status, 304);
    assert.equal(r.body, null);
    assert.equal(await r.text(), "");
    assert.equal(r.headers.get("etag"), tag);
    assert.equal(r.headers.get("x-content-type-options"), "nosniff");
    assert.equal(r.headers.get("cache-control"), "public, max-age=0, must-revalidate, stale-while-revalidate=300");
  });

  await t("afwijkende of sterke If-None-Match geeft gewoon 200 met body", async () => {
    const { env } = maakEnv({});
    const tag = (await data({ request: req("/data.json"), env })).headers.get("etag")!;
    for (const kop of ['W/"0000"', tag.slice(2), `${tag}, W/"anders"`, "*"]) {
      const r = await data({ request: req("/data.json", { headers: { "If-None-Match": kop } }), env });
      assert.equal(r.status, 200, kop);
      assert.equal(r.headers.get("etag"), tag);
      assert.equal((await r.json() as any).items.length, 1);
    }
  });

  await t("?statisch=1 slaat de KV over en geeft no-cache zonder ETag", async () => {
    const { env, kvLeest, assetsVragen } = maakEnv({ uur: { ...statisch, gegenereerd: "2026-10-30T10:00:00Z", dag_samenvatting: "Uur" } });
    const r = await data({ request: req("/data.json?statisch=1"), env });
    assert.equal(r.status, 200);
    assert.deepEqual(kvLeest, []);
    assert.deepEqual(assetsVragen, ["https://nieuws.example/data.json"]);
    assert.equal(r.headers.get("cache-control"), "no-cache");
    assert.equal(r.headers.get("etag"), null);
    assert.deepEqual(await r.json(), statisch);
  });

  await t("?statisch=1 geeft oude statische data ongefilterd terug (geen vandaag-filter, vaste klok)", async () => {
    const oud = {
      gegenereerd: "2026-10-28T07:00:00Z",
      items: [{ titel: "Oud bericht", t: Date.parse("2026-10-28T06:30:00Z"), bronnen: [{ href: "https://nos.nl/oud" }] }],
      filmpjes: [{ href: "https://example.com/v", titel: "Oud filmpje" }],
      dumpert: [],
      ontdubbeld: 2,
    };
    const { env } = maakEnv({});
    env.ASSETS.fetch = async () => Response.json(oud);
    const r = await data({ request: req("/data.json?statisch=1"), env });
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), oud);
  });

  await t("?statisch zonder waarde slaat de KV ook over", async () => {
    const { env, kvLeest } = maakEnv({});
    await data({ request: req("/data.json?statisch"), env });
    assert.deepEqual(kvLeest, []);
  });

  await t("?statisch=1 negeert If-None-Match", async () => {
    const { env } = maakEnv({});
    const tag = (await data({ request: req("/data.json"), env })).headers.get("etag")!;
    const r = await data({ request: req("/data.json?statisch=1", { headers: { "If-None-Match": tag } }), env });
    assert.equal(r.status, 200);
  });

  await t("zonder ?statisch leest de KV eerst data-vooraf en daarna uur en sv-klaar", async () => {
    const { env, kvLeest } = maakEnv({});
    await data({ request: req("/data.json"), env });
    assert.deepEqual(kvLeest, ["data-vooraf", "uur", "sv-klaar"]);
  });

  await t("mislukte ASSETS-fetch geeft een tijdelijke 503 na de data-vooraf-read", async () => {
    const { env, kvLeest } = maakEnv({}, { assetStatus: 404 });
    const r = await data({ request: req("/data.json"), env });
    assert.equal(r.status, 503);
    assert.equal(r.headers.get("retry-after"), "60");
    assert.deepEqual(kvLeest, ["data-vooraf"]);
    assert.equal(r.headers.get("etag"), null);
  });

  console.log(`\n${n} tests geslaagd`);
} finally {
  Date.now = origineel;
}
