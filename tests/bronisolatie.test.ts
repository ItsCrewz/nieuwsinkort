import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { Runner } from "../worker/src/index";
import { foutcode } from "../worker/src/bronfouten";

Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
const urls = Array.from({ length: 4 }, (_, i) => `https://bron${i}.nl/rss`);
const codes = ["SRC_TIMEOUT", "SRC_HTTP", "SRC_PARSE", "SRC_EMPTY"] as const;
const echte = globalThis.fetch;
globalThis.fetch = (async (u: any) => String(u).includes("/bronnen.json") ? Response.json({ groepen: [{ id: "nl", bronnen: urls.map((url, i) => ({ id: String(i), naam: `Bron ${i}`, feeds: [{ url }] })) }] }) : new Response("", { status: 404 })) as any;
try {
  for (const aantal of [1, 2, 3, 4]) {
    const kv = new Map<string, string>([["uur", "vorige data"]]);
    const opslag = new Map<string, any>();
    const env: any = { SITE: "https://lokaal", MODEL: "m", NIEUWS: { get: async (k: string, type?: string) => { const v = kv.get(k); return v == null ? null : type === "json" ? JSON.parse(v) : v; }, put: async (k: string, v: string) => { kv.set(k, v); } }, FETCHER: { idFromName: (x: string) => x, get: () => ({ fetch: async (_u: string, init: any) => Response.json(JSON.parse(init.body).jobs.map((j: any) => { const i = urls.indexOf(j.url); return i >= 0 && i < aantal ? { url: j.url, ok: false, status: 0, code: codes[i], ms: i + 1 } : { url: j.url, ok: true, status: 200, ms: 1, entries: [], videos: [] }; })) }) } };
    const ctx: any = { storage: { get: async (k: string) => opslag.get(k), put: async (k: string, v: any) => { opslag.set(k, v); }, setAlarm: async () => {} }, blockConcurrencyWhile: async (fn: any) => fn() };
    const oudeError = console.error; console.error = () => {};
    let response: Response;
    try { response = await new Runner(ctx, env).fetch(new Request("https://do/run")); } finally { console.error = oudeError; }
    assert.equal(response.status, aantal === 4 ? 500 : 200);
    assert.equal(kv.get("uur") === "vorige data", aantal === 4);
    assert.deepEqual(JSON.parse(kv.get("run-status")!).bronfouten.map((f: any) => [f.code, f.ms]), codes.slice(0, aantal).map((c, i) => [c, i + 1]));
  }
  assert.equal(foutcode(new DOMException("timed out", "TimeoutError")), "SRC_TIMEOUT");
  assert.equal(foutcode(new Error("HTTP 503")), "SRC_HTTP");
  console.log("✓ bronuitval bij één, helft, bijna alle en alle nieuwsfeeds");
} finally { globalThis.fetch = echte; }
