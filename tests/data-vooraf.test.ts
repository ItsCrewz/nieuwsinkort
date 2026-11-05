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
const env = { ASSETS: { fetch: async () => { assets++; return Response.json(S); } }, NIEUWS: { get: async (key: string, opts: { type: "json" | "text"; cacheTtl?: number }) => {
  if (key === "data-vooraf") { assert.equal(opts.type, "text"); assert.equal(opts.cacheTtl, 60); return `${dag}\n${tag}\n${body}`; }
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

// #297: verwerkt vooraf-antwoord wordt per isolate 30 s hergebruikt, maar nooit bij andere KV-tekst of na afloop
{
  const echteTijd = Date.now;
  try {
    let t0 = Date.parse("2026-11-04T10:00:00Z");
    Date.now = () => t0;
    const d = "2026-11-04";
    const maak = (titel: string) => { const b = JSON.stringify({ gegenereerd: new Date(t0).toISOString(), items: [{ titel }], filmpjes: [], dumpert: [] }); return b; };
    let tekst = `${d}\nx\n${maak("een")}`;
    const kv = { ASSETS: { fetch: async () => { throw new Error("geen assets"); } }, NIEUWS: { get: async () => tekst } };
    const vraag = () => onRequestGet({ request: new Request("https://site.test/data.json"), env: kv });
    const a = await vraag(); const aBody = await a.text();
    t0 += 10e3; const b = await vraag();
    assert.equal(await b.text(), aBody); assert.equal(b.headers.get("etag"), a.headers.get("etag"));
    tekst = `${d}\nx\n${maak("twee")}`;
    const c = await vraag(); assert.notEqual(c.headers.get("etag"), a.headers.get("etag")); assert.ok((await c.text()).includes("twee"));
  } finally { Date.now = echteTijd; }
}

// #297: respons (body + ETag) van de geheugencache is identiek aan het oude pad zonder cache; 30 s en dagwissel verwerken opnieuw
{
  const echteTijd = Date.now, echteParse = JSON.parse;
  try {
    let t0 = Date.parse("2026-11-04T10:00:00Z");
    Date.now = () => t0;
    const iso = (m: number) => new Date(t0 - m * 60e3).toISOString();
    const data = {
      gegenereerd: iso(5), datum: "woensdag 4 november",
      items: [{ titel: "Een", bronnen: [{ naam: "NOS", href: "https://nos.nl/a", ft: "x" }] }, { titel: "Twee", bronnen: [] }],
      filmpjes: [{ href: "https://v.test/1", t: t0 - 60e3, tijd: "09:59" }, { href: "https://v.test/2", t: t0 - 30 * 3600e3, tijd: "04:00", gisteren: true }],
      dumpert: [{ href: "https://d.test/1", t: t0 - 120e3, tijd: "09:58" }],
    };
    const payload = JSON.stringify(data);
    // oude pad: parse, dagfilter, stringify, etag; geen geheugen
    const oud = async (nu: number) => {
      const d = echteParse(payload), g = alleenVandaag(d, nu);
      const b = JSON.stringify({ ...d, ...(Array.isArray(d.filmpjes) ? { filmpjes: g.filmpjes } : {}), ...(Array.isArray(d.dumpert) ? { dumpert: g.dumpert } : {}) });
      return { b, tag: await etag(b) };
    };
    let parses = 0;
    JSON.parse = ((s: string, ...a: any[]) => { if (s === payload) parses++; return (echteParse as any)(s, ...a); }) as typeof JSON.parse;
    const tekst = `2026-11-04\nx\n${payload}`;
    const kv = { ASSETS: { fetch: async () => { throw new Error("geen assets"); } }, NIEUWS: { get: async () => tekst } };
    const vraag = () => onRequestGet({ request: new Request("https://site.test/data.json"), env: kv });
    const verwacht = await oud(t0);
    const a = await vraag(), aBody = await a.text();
    assert.equal(aBody, verwacht.b); assert.equal(a.headers.get("etag"), verwacht.tag); assert.equal(parses, 1);
    t0 += 10e3; // binnen 30 s: uit geheugen, nog steeds identiek aan het oude pad
    const b = await vraag();
    assert.equal(await b.text(), (await oud(t0)).b); assert.equal(b.headers.get("etag"), (await oud(t0)).tag); assert.equal(parses, 1);
    t0 += 21e3; // 31 s na vullen: opnieuw verwerken
    const c = await vraag();
    assert.equal(parses, 2); assert.equal(await c.text(), (await oud(t0)).b);
    // dagwissel binnen 30 s: 23:59:50 -> 00:00:05 Amsterdam, zelfde KV-tekst (vooraf van gisteren geldt 's nachts nog)
    t0 = Date.parse("2026-11-04T22:59:50Z");
    parses = 0;
    await vraag(); assert.equal(parses, 1);
    t0 += 15e3;
    const d = await vraag();
    assert.equal(parses, 2); assert.equal(await d.text(), (await oud(t0)).b);
  } finally { Date.now = echteTijd; JSON.parse = echteParse; }
}
console.log("✓ #297 geheugencache identiek, 30 s en dagwissel");
