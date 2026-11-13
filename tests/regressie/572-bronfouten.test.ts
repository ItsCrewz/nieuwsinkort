import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import { Runner, runJob } from "../../worker/src/index";

Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
const bronnen = JSON.parse(readFileSync("tests/regressie/fixtures/572-bronnen.json", "utf8"));
const oudFetch = globalThis.fetch;
const kv = new Map<string, string>(), opslag = new Map<string, any>();
const bleep = "https://www.bleepingcomputer.com/feed/";
const cisa = "https://www.cisa.gov/news.xml";
let pogingen = 0;
globalThis.fetch = (async (input: any) => {
  const url = String(input);
  if (url.includes("/bronnen.json")) return Response.json(bronnen);
  if (url === bleep) { pogingen++; return new Response("", { status: 403 }); }
  if (url === cisa) return new Response("", { status: 404 });
  if (url.includes("cisa.gov")) return new Response("<rss><channel></channel></rss>");
  return new Response("", { status: 404 });
}) as typeof fetch;
const env: any = {
  SITE: "https://lokaal", MODEL: "m",
  NIEUWS: { get: async (k: string, type?: string) => { const v = kv.get(k); return v == null ? null : type === "json" ? JSON.parse(v) : v; }, put: async (k: string, v: string) => { kv.set(k, v); } },
  FETCHER: { idFromName: (x: string) => x, get: () => ({ fetch: async (_u: string, init: any) => Response.json(await Promise.all(JSON.parse(init.body).jobs.map((j: any) => j.url === bleep || j.url.includes("cisa.gov") ? runJob(j, 0) : { url: j.url, ok: true, status: 200, ms: 1, entries: [], videos: [] }))) }) },
};
const ctx: any = { storage: { get: async (k: string) => opslag.get(k), put: async (k: string | Record<string, any>, v?: any) => { if (typeof k === "string") opslag.set(k, v); else for (const [key, waarde] of Object.entries(k)) opslag.set(key, waarde); }, delete: async (k: string) => opslag.delete(k), getAlarm: async () => null, setAlarm: async () => {} }, blockConcurrencyWhile: async (fn: any) => fn() };
try {
  const res = await new Runner(ctx, env).fetch(new Request("https://do/run"));
  assert.equal(res.status, 200);
  assert.equal(pogingen, 2);
  const fouten = JSON.parse(kv.get("uur")!).meta.bronfouten;
  assert.deepEqual(fouten.map((f: any) => [f.url, f.code, f.status]).sort(), [[bleep, "SRC_HTTP", 403], [cisa, "SRC_HTTP", 404]].sort());
  assert.equal(JSON.parse(kv.get("uur")!).bronstats["tech|cisa"].fout, "1 van 3 feeds niet bereikbaar");
  console.log("✓ bronfouten blijven zichtbaar en de run gaat door");
} finally { globalThis.fetch = oudFetch; }
