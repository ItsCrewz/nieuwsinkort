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
console.log("✓ vooraf berekenen, snel pad, 304 en terugval");
