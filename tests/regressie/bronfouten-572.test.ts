import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { Fetcher, Runner } from "../../worker/src/index";

Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
const bleeping = "https://www.bleepingcomputer.com/feed/";
const cisa = "https://www.cisa.gov/news.xml";
const goed = "https://www.cisa.gov/cybersecurity-advisories/all.xml";
const urls = [bleeping, cisa, goed];
const xml = `<rss><channel><item><title>Beveiligingsadvies</title><link>https://www.cisa.gov/news/advies</link><pubDate>${new Date().toUTCString()}</pubDate></item></channel></rss>`;
const echteFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = String(input);
  if (url.includes("/bronnen.json")) return Response.json({ groepen: [{ id: "tech", bronnen: urls.map((feed, i) => ({ id: String(i), naam: `Bron ${i}`, feeds: [{ url: feed }] })) }] });
  if (url === bleeping) return new Response("geweigerd", { status: 403 });
  if (url === cisa) return new Response("niet gevonden", { status: 404 });
  if (url === goed) return new Response(xml);
  return new Response("", { status: 404 });
}) as typeof fetch;
try {
  const kv = new Map<string, string>();
  const opslag = new Map<string, any>();
  const storage = { get: async (k: string) => opslag.get(k), put: async (k: string | Record<string, any>, v?: any) => { if (typeof k === "string") opslag.set(k, v); else for (const [key, waarde] of Object.entries(k)) opslag.set(key, waarde); }, delete: async (k: string) => opslag.delete(k), getAlarm: async () => null, setAlarm: async () => {} };
  const fetcher = new Fetcher({ storage } as any, {} as any);
  const env: any = { SITE: "https://lokaal", MODEL: "m", NIEUWS: { get: async (k: string, type?: string) => { const v = kv.get(k); return v == null ? null : type === "json" ? JSON.parse(v) : v; }, put: async (k: string, v: string) => { kv.set(k, v); } }, FETCHER: { idFromName: (x: string) => x, get: () => ({ fetch: (u: string, init: RequestInit) => fetcher.fetch(new Request(u, init)) }) } };
  const ctx: any = { storage, blockConcurrencyWhile: async (fn: () => Promise<unknown>) => fn() };
  const antwoord = await new Runner(ctx, env).fetch(new Request("https://do/run"));
  assert.equal(antwoord.status, 200);
  const data = JSON.parse(kv.get("uur")!);
  for (const [url, status] of [[bleeping, 403], [cisa, 404]] as const) {
    assert.deepEqual(data.meta.bronfouten.find((f: any) => f.url === url), { url, code: "SRC_HTTP", status });
    assert.equal(JSON.parse(kv.get("run-status")!).bronfouten.find((f: any) => f.url === url).status, status);
  }
  assert.ok(data.meta.items > 0);
  console.log("✓ bronfouten met HTTP-status stoppen de run niet");
} finally { globalThis.fetch = echteFetch; }
