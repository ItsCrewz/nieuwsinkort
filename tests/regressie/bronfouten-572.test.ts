import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { Fetcher, Runner } from "../../worker/src/index";

Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
const bleeping = "https://www.bleepingcomputer.com/feed/";
const cisa = "https://www.cisa.gov/news.xml";
const goed = "https://voorbeeld.nl/feed/";
const origineel = globalThis.fetch;
const datum = new Date().toUTCString();
globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = String(input);
  if (url.includes("/bronnen.json")) return Response.json({ groepen: [{ id: "tech", bronnen: [bleeping, cisa, goed].map((u, i) => ({ id: String(i), naam: `Bron ${i}`, feeds: [{ url: u }] })) }] });
  if (url === bleeping) return new Response("geweigerd", { status: 403 });
  if (url === cisa) return new Response("niet gevonden", { status: 404 });
  if (url === goed) return new Response(`<rss><channel><item><title>Voorbeeldbericht</title><link>https://voorbeeld.nl/nieuws</link><pubDate>${datum}</pubDate></item></channel></rss>`);
  return new Response("", { status: 404 });
}) as typeof fetch;
try {
  const kv = new Map<string, string>();
  const opslag = new Map<string, any>();
  const fetcher = new Fetcher({ storage: {} } as any, {} as any);
  const env: any = { SITE: "https://lokaal", MODEL: "m", NIEUWS: { get: async (k: string, type?: string) => { const v = kv.get(k); return v == null ? null : type === "json" ? JSON.parse(v) : v; }, put: async (k: string, v: string) => { kv.set(k, v); } }, FETCHER: { idFromName: (x: string) => x, get: () => ({ fetch: (u: string, init: RequestInit) => fetcher.fetch(new Request(u, init)) }) } };
  const ctx: any = { storage: { get: async (k: string) => opslag.get(k), put: async (k: string | Record<string, any>, v?: any) => { if (typeof k === "string") opslag.set(k, v); else for (const [key, waarde] of Object.entries(k)) opslag.set(key, waarde); }, delete: async (k: string) => opslag.delete(k), getAlarm: async () => null, setAlarm: async () => {} }, blockConcurrencyWhile: async (fn: any) => fn() };
  const response = await new Runner(ctx, env).fetch(new Request("https://do/run"));
  assert.equal(response.status, 200);
  const opgeslagen = JSON.parse(kv.get("uur")!);
  const fouten = opgeslagen.meta.bronfouten.filter((f: any) => f.url === bleeping || f.url === cisa);
  assert.deepEqual(fouten.map((f: any) => [f.url, f.code, f.status]).sort(), [[bleeping, "SRC_HTTP", 403], [cisa, "SRC_HTTP", 404]].sort());
  assert.ok(opgeslagen.meta.feeds > 0);
  assert.deepEqual(JSON.parse(kv.get("run-status")!).bronfouten.filter((f: any) => f.url === bleeping || f.url === cisa), fouten);
  console.log("✓ bronfouten met HTTP-status en voortzetting van de run");
} finally { globalThis.fetch = origineel; }
