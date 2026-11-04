import assert from "node:assert/strict";
import { onRequestGet, berekenBody, etag, merge, slim } from "../functions/data.json";
import { alleenVandaag } from "../src/vandaag";
import { schoon } from "../src/schoon";

const nu = new Date().toISOString();
const S = { gegenereerd: nu, items: [], filmpjes: [], dumpert: [] };
const H = { gegenereerd: nu, items: [], filmpjes: [], dumpert: [], meta: { aiStand: "normaal" } };
const sv = { klaar: { abc: { tekst: "Klaar" } } };
const body = await berekenBody(S, H, sv);
const verwacht = JSON.stringify(slim({ ...schoon(alleenVandaag(merge(S, H), Date.now())), samenvattingen: sv.klaar }));
assert.equal(body, verwacht);
const tag = await etag(body);
const dag = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Amsterdam" });
let assets = 0;
const env = { ASSETS: { fetch: async () => { assets++; return Response.json(S); } }, NIEUWS: { get: async (key: string, type: "json" | "text") => {
  if (key === "data-vooraf") { assert.equal(type, "text"); return `${dag}\n${tag}\n${body}`; }
  throw new Error("onverwacht KV-verzoek");
} } };
let r = await onRequestGet({ request: new Request("https://site.test/data.json"), env });
assert.equal(await r.text(), body); assert.equal(r.headers.get("etag"), tag); assert.equal(assets, 0);
r = await onRequestGet({ request: new Request("https://site.test/data.json", { headers: { "If-None-Match": tag } }), env });
assert.equal(r.status, 304); assert.equal(await r.text(), ""); assert.equal(assets, 0);
for (const vooraf of [null, `2000-01-01\n${tag}\n${body}`]) {
  const fallback = { ...env, NIEUWS: { get: async (key: string) => key === "data-vooraf" ? vooraf : key === "uur" ? H : sv } };
  r = await onRequestGet({ request: new Request("https://site.test/data.json"), env: fallback });
  assert.equal(await r.text(), body);
}
assert.equal(assets, 2);
const origineleTijd = Date.now;
try {
  const nachtBody = '{"items":[{"titel":"Gisteren"}]}';
  const nachtTag = await etag(nachtBody);
  let nachtAssets = 0;
  let voorafDag = "2026-10-28";
  const nachtEnv = {
    ASSETS: { fetch: async () => { nachtAssets++; return Response.json(S); } },
    NIEUWS: { get: async (key: string) => key === "data-vooraf" ? `${voorafDag}\n${nachtTag}\n${nachtBody}` : null },
  };
  Date.now = () => Date.parse("2026-10-28T23:30:00Z"); // 00:30 in Amsterdam
  r = await onRequestGet({ request: new Request("https://site.test/data.json"), env: nachtEnv });
  assert.equal(await r.text(), nachtBody); assert.equal(r.headers.get("etag"), nachtTag); assert.equal(nachtAssets, 0);
  r = await onRequestGet({ request: new Request("https://site.test/data.json", { headers: { "If-None-Match": nachtTag } }), env: nachtEnv });
  assert.equal(r.status, 304); assert.equal(await r.text(), ""); assert.equal(nachtAssets, 0);
  r = await onRequestGet({ request: new Request("https://site.test/data.json?statisch=1"), env: nachtEnv });
  assert.notEqual(await r.text(), nachtBody); assert.equal(nachtAssets, 1);
  voorafDag = "2026-10-27";
  r = await onRequestGet({ request: new Request("https://site.test/data.json"), env: nachtEnv });
  assert.notEqual(await r.text(), nachtBody); assert.equal(nachtAssets, 2);
  voorafDag = "2026-10-28";
  Date.now = () => Date.parse("2026-10-29T06:00:00Z"); // 07:00 in Amsterdam
  r = await onRequestGet({ request: new Request("https://site.test/data.json"), env: nachtEnv });
  assert.notEqual(await r.text(), nachtBody); assert.equal(nachtAssets, 3);
} finally {
  Date.now = origineleTijd;
}
// ASSETS-fouten: twee pogingen, daarna 503 met no-store en Retry-After (vaste klok)
Date.now = () => Date.parse("2026-10-28T10:00:00Z");
try {
  let a = 0;
  const fouten = { ASSETS: { fetch: async () => { a++; return new Response(null, { status: 503 }); } }, NIEUWS: { get: async () => null } };
  r = await onRequestGet({ request: new Request("https://site.test/data.json"), env: fouten });
  assert.equal(r.status, 503); assert.equal(r.headers.get("retry-after"), "60"); assert.equal(r.headers.get("cache-control"), "no-store"); assert.equal(a, 2);
  assert.ok((await r.json()).fout);
  a = 0;
  const gooit = { ...fouten, ASSETS: { fetch: async () => { a++; throw new Error("stuk"); } } };
  r = await onRequestGet({ request: new Request("https://site.test/data.json"), env: gooit });
  assert.equal(r.status, 503); assert.equal(a, 2);
  a = 0;
  const herstel = { ...fouten, ASSETS: { fetch: async () => { a++; return a === 1 ? new Response(null, { status: 503 }) : Response.json(S); } } };
  r = await onRequestGet({ request: new Request("https://site.test/data.json"), env: herstel });
  assert.equal(r.status, 200); assert.equal(a, 2);
} finally {
  Date.now = origineleTijd;
}
console.log("✓ vooraf berekenen, snel pad, 304 en terugval");
