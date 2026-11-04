import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import { Runner } from "../../worker/src/index";
import { prefetchMeer } from "../../src/meer";
import type { Item } from "../../src/types";

const [item] = JSON.parse(readFileSync("tests/fixtures/joey/punten-ahold-508.json", "utf8")) as Item[];
const key = item.meer!;
const oud = { uitleg: ["Delft organiseert een festival over kunst en robotica."], perBron: [{ site: "Computable", punten: ["NorthC investeert in datacenters."] }] };
const nu = Date.parse("2026-11-04T12:45:00Z");
const data = new Map<string, string>([["state", JSON.stringify({ datum: "2026-11-04", neuronDag: "2026-11-04", neurons: 9000, calls: 0, runs: 1, sums: {}, links: {}, diep: { [key]: { ...oud, at: nu } } })], ["meer", JSON.stringify({ datum: "2026-11-04", items: { [key]: oud } })]]);
const opslag = new Map<string, unknown>();
const kv = { get: async (k: string, type?: string) => { const v = data.get(k); return type === "json" ? (v ? JSON.parse(v) : null) : v ?? null; }, put: async (k: string, v: string) => { data.set(k, v); } };
const storage = { get: async (k: string) => opslag.get(k), put: async (k: string, v: unknown) => { opslag.set(k, v); }, delete: async (k: string) => { opslag.delete(k); }, getAlarm: async () => null, setAlarm: async () => {} };
const env = { SITE: "https://lokaal", NIEUWS: kv, FETCHER: { idFromName: (x: string) => x, get: () => ({ fetch: async (_u: string, init: RequestInit) => Response.json(JSON.parse(init.body as string).jobs.map((j: { url: string }) => ({ url: j.url, ok: true, status: 200, entries: [], videos: [] }))) }) } };
const echteFetch = globalThis.fetch, echteNow = Date.now;
Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
Date.now = () => nu;
globalThis.fetch = (async (url: string | URL | Request) => String(url).includes("bronnen.json") ? Response.json({ groepen: [] }) : String(url).includes("data.json?statisch=1") ? Response.json({ gegenereerd: new Date(nu).toISOString(), items: [item], filmpjes: [], dumpert: [] }) : Response.json(oud)) as typeof fetch;
try {
  const runner = new Runner({ storage, blockConcurrencyWhile: async (fn: () => Promise<unknown>) => fn() } as any, env as any);
  const response = await runner.fetch(new Request("https://do/run"));
  assert.equal(response.status, 200);
  const meer = JSON.parse(data.get("meer")!);
  assert.equal(meer.items[key], undefined, "oude uitleg bij verzamelartikel mag niet opnieuw worden gepubliceerd");
  const normaal = { ...item, bronnen: [{ site: "Computable", href: "https://voorbeeld.nl/nieuws" }] };
  assert.deepEqual(await prefetchMeer(normaal), oud, "de oude clientcache is vooraf gevuld");
  assert.equal(await prefetchMeer(item), null, "ook bestaande clientcache met oude uitleg is onveilig");
  console.log("ok - Worker en client negeren oude meer-cache voor Ahold");
} finally { globalThis.fetch = echteFetch; Date.now = echteNow; }
