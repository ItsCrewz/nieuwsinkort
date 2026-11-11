import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import { Runner } from "../../worker/src/index";

const bestaand = JSON.parse(readFileSync("public/bronnen.json", "utf8"));
const tech = bestaand.groepen.find((g: any) => g.id === "tech");
const bronnen = tech.bronnen.filter((b: any) => ["bleepingcomputer", "cisa"].includes(b.id));
assert.equal(bronnen.length, 2);
const bleep = bronnen.find((b: any) => b.id === "bleepingcomputer").feeds[0].url;
const cisa = bronnen.find((b: any) => b.id === "cisa").feeds;
assert.equal(cisa.length, 3);
const nu = Date.parse("2026-11-05T07:00:00Z");
const data = new Map<string, string>();
const opslag = new Map<string, unknown>();
const kv = { get: async (k: string, type?: string) => { const v = data.get(k); return type === "json" ? (v ? JSON.parse(v) : null) : v ?? null; }, put: async (k: string, v: string) => { data.set(k, v); } };
const storage = { get: async (k: string) => opslag.get(k), put: async (k: string, v: unknown) => { opslag.set(k, v); }, delete: async (k: string) => { opslag.delete(k); }, getAlarm: async () => null, setAlarm: async () => {} };
const env = { SITE: "https://lokaal", NIEUWS: kv, FETCHER: { idFromName: (x: string) => x, get: () => ({ fetch: async (_u: string, init: RequestInit) => Response.json(JSON.parse(init.body as string).jobs.map((j: { url: string }) => {
  const status = j.url === bleep ? 403 : j.url === cisa[0].url ? 404 : 200;
  return { url: j.url, ok: status === 200, status, ...(status !== 200 ? { err: `HTTP ${status}` } : {}), entries: j.url === cisa[1].url ? [{ t: "CISA publiceert een nieuw beveiligingsadvies", l: "https://www.cisa.gov/news-events/nieuw-advies", s: "CISA waarschuwt organisaties voor een kwetsbaarheid in software en adviseert om updates te installeren.", d: nu }] : [], videos: [] };
})) }) } };
const echteFetch = globalThis.fetch, echteNow = Date.now, echteCrypto = Object.getOwnPropertyDescriptor(globalThis, "crypto");
Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
Date.now = () => nu;
globalThis.fetch = (async (url: string | URL | Request) => String(url).includes("bronnen.json") ? Response.json({ groepen: [{ id: "tech", bronnen }] }) : Response.json({ gegenereerd: new Date(nu).toISOString(), items: [], filmpjes: [], dumpert: [] })) as typeof fetch;
try {
  const runner = new Runner({ storage, blockConcurrencyWhile: async (fn: () => Promise<unknown>) => fn() } as any, env as any);
  const response = await runner.fetch(new Request("https://do/run"));
  assert.equal(response.status, 200);
  // run() zet de meta-velden op het hoogste niveau van de respons
  const resultaat = await response.json() as any;
  assert.deepEqual(resultaat.bronfeedsOvergeslagen.map((f: any) => [f.bron, f.url, f.status]), [["tech|bleepingcomputer", bleep, 403], ["tech|cisa", cisa[0].url, 404]]);
  const uur = JSON.parse(data.get("uur")!);
  assert.equal(uur.bronstats["tech|cisa"].vandaag, 1);
  assert.ok(uur.items.some((item: any) => item.bronnen?.some((bron: any) => bron.href.includes("cisa.gov"))));
  console.log("ok - mislukte bronfeeds melden hun status en andere feed levert een item");
} finally {
  globalThis.fetch = echteFetch; Date.now = echteNow;
  if (echteCrypto) Object.defineProperty(globalThis, "crypto", echteCrypto); else delete (globalThis as any).crypto;
}
