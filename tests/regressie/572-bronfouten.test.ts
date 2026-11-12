import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { Runner, runJob } from "../../worker/src/index";

Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
const urls = ["https://www.bleepingcomputer.com/feed/", "https://www.cisa.gov/news.xml", "https://andere-bron.nl/feed/"];
const echte = globalThis.fetch;
const kv = new Map<string, string>();
const opslag = new Map<string, any>();
globalThis.fetch = (async (u: any) => {
  const url = String(u);
  if (url.includes("/bronnen.json")) return Response.json({ groepen: [{ id: "tech", bronnen: urls.map((feed, i) => ({ id: String(i), naam: `Bron ${i}`, feeds: [{ url: feed }] })) }] });
  if (url === urls[0]) return new Response("", { status: 403 });
  if (url === urls[1]) return new Response("", { status: 404 });
  if (url === urls[2]) return new Response("<rss><channel></channel></rss>");
  return new Response("", { status: 404 });
}) as any;
try {
  const env: any = { SITE: "https://lokaal", MODEL: "m", NIEUWS: { get: async (k: string, type?: string) => { const v = kv.get(k); return v == null ? null : type === "json" ? JSON.parse(v) : v; }, put: async (k: string, v: string) => { kv.set(k, v); } }, FETCHER: { idFromName: (x: string) => x, get: () => ({ fetch: async (_u: string, init: any) => Response.json(await Promise.all(JSON.parse(init.body).jobs.map((j: any) => urls.includes(j.url) ? runJob(j, 0) : Promise.resolve({ url: j.url, ok: true, status: 200, ms: 1, entries: [], videos: [] })))) }) } };
  const ctx: any = { storage: { get: async (k: string) => opslag.get(k), put: async (k: string | Record<string, any>, v?: any) => { if (typeof k === "string") opslag.set(k, v); else for (const [key, waarde] of Object.entries(k)) opslag.set(key, waarde); }, delete: async (k: string) => opslag.delete(k), getAlarm: async () => null, setAlarm: async () => {} }, blockConcurrencyWhile: async (fn: any) => fn() };
  const response = await new Runner(ctx, env).fetch(new Request("https://do/run"));
  assert.equal(response.status, 200);
  const fouten = JSON.parse(kv.get("uur")!).meta.bronfouten;
  assert.deepEqual(fouten.filter((f: any) => urls.includes(f.url)).map((f: any) => [f.url, f.code, f.status]), [[urls[0], "SRC_HTTP", 403], [urls[1], "SRC_HTTP", 404]]);
  console.log("✓ bronfouten met HTTP-status blokkeren de run niet");
} finally { globalThis.fetch = echte; }
