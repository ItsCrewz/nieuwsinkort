import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { Runner } from "../../worker/src/index";

Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
const url = "https://voorbeeld.nl/kort-nieuws-en-meer";
const tekst = "Dr. Jansen onderzoekt de belangrijke zaak en verwacht binnenkort meer duidelijkheid over alle betrokkenen. Daarna ander nieuws.";
const bronnen = { groepen: [{ id: "nl", bronnen: [{ id: "test", naam: "Testbron", feeds: [{ url: "https://voorbeeld.nl/rss" }] }] }] };
const kv = new Map<string, string>(), opslag = new Map<string, unknown>(), prompts: string[] = [];
const env: any = {
  SITE: "https://lokaal", MODEL: "m",
  NIEUWS: { get: async (k: string, type?: string) => { const v = kv.get(k); return v == null ? null : type === "json" ? JSON.parse(v) : v; }, put: async (k: string, v: string) => { kv.set(k, v); } },
  FETCHER: { idFromName: (x: string) => x, get: () => ({ fetch: async (_u: string, init: any) => Response.json(JSON.parse(init.body).jobs.map((j: any) => ({ url: j.url, ok: true, entries: j.url.endsWith("/rss") ? [{ t: "Jansen onderzoekt een belangrijke zaak", l: url, s: tekst, d: Date.now() }] : [], videos: [] }))) }) },
  AI: { run: async (_model: string, args: any) => { prompts.push(args.messages[1].content); return { response: '{"items":[]}' }; } },
};
const ctx: any = { storage: { get: async (k: string) => opslag.get(k), put: async (k: string, v: unknown) => { opslag.set(k, v); }, delete: async (k: string) => { opslag.delete(k); }, setAlarm: async () => {}, getAlarm: async () => null }, blockConcurrencyWhile: async (fn: () => Promise<unknown>) => fn() };
const echteFetch = globalThis.fetch;
globalThis.fetch = (async (u: any) => String(u).includes("/bronnen.json") ? Response.json(bronnen) : new Response("nee", { status: 404 })) as any;
try { await new Runner(ctx, env).run(true); } finally { globalThis.fetch = echteFetch; }
const prompt = prompts.find((p) => p.includes("Berichten:\n"));
assert.ok(prompt, "de Worker verstuurt een artikelprompt");
const items = JSON.parse(prompt.split("Berichten:\n")[1]);
assert.equal(items[0].tekst, "Dr. Jansen onderzoekt de belangrijke zaak en verwacht binnenkort meer duidelijkheid over alle betrokkenen.");
assert.equal(items[0].titel, "Jansen onderzoekt een belangrijke zaak");
assert.equal(items[0].bron, "Testbron");
console.log("ok - Worker begrenst de echte artikelinvoer");
