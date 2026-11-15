import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { Runner, runJob } from "../../worker/src/index";

Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
const bleeping = "https://www.bleepingcomputer.com/feed/";
const cisa = "https://www.cisa.gov/news.xml";
const goed = "https://www.cisa.gov/cybersecurity-advisories/all.xml";
const urls = [bleeping, cisa, goed];
const origineel = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = String(input);
  if (url.includes("/bronnen.json")) return Response.json({ groepen: [{ id: "tech", bronnen: urls.map((u, i) => ({ id: String(i), naam: `Bron ${i}`, feeds: [{ url: u }] })) }] });
  if (url === bleeping) return new Response("geweigerd", { status: 403 });
  if (url === cisa) return new Response("niet gevonden", { status: 404 });
  if (url === goed) return new Response("<rss><channel></channel></rss>");
  return new Response("", { status: 404 });
}) as typeof fetch;
try {
  const kv = new Map<string, string>();
  const opslag = new Map<string, any>();
  const env: any = { SITE: "https://lokaal", MODEL: "m", NIEUWS: { get: async (k: string, type?: string) => { const v = kv.get(k); return v == null ? null : type === "json" ? JSON.parse(v) : v; }, put: async (k: string, v: string) => { kv.set(k, v); } }, FETCHER: { idFromName: (x: string) => x, get: () => ({ fetch: async (_u: string, init: any) => Response.json(await Promise.all(JSON.parse(init.body).jobs.map((j: any) => runJob(j, 0)))) }) } };
  const ctx: any = { storage: { get: async (k: string) => opslag.get(k), put: async (k: string | Record<string, any>, v?: any) => { if (typeof k === "string") opslag.set(k, v); else for (const [key, waarde] of Object.entries(k)) opslag.set(key, waarde); }, delete: async (k: string) => opslag.delete(k), getAlarm: async () => null, setAlarm: async () => {} }, blockConcurrencyWhile: async (fn: any) => fn() };
  const response = await new Runner(ctx, env).fetch(new Request("https://do/run"));
  assert.equal(response.status, 200);
  const resultaat: any = await response.json();
  const fouten = resultaat.bronfouten.filter((f: any) => urls.includes(f.url));
  assert.deepEqual(fouten.map((f: any) => [f.url, f.code, f.status]), [[bleeping, "SRC_HTTP", 403], [cisa, "SRC_HTTP", 404]]);
  assert.ok(kv.get("uur"));
  console.log("✓ HTTP-fouten in runmeta; overige feed gaat door");
} finally { globalThis.fetch = origineel; }
