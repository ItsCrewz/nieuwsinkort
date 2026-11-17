import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { Runner, haalArtikelBatches } from "../../worker/src/index";

Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
const nu = Date.parse("2026-11-04T12:45:00Z");
const echteFetch = globalThis.fetch, echteNow = Date.now, echteError = console.error;
Date.now = () => nu;
globalThis.fetch = (async (url: string | URL | Request) => String(url).includes("bronnen.json") ? Response.json({ groepen: [{ id: "nl", bronnen: [{ id: "bron", naam: "Bron", feeds: [{ url: "https://voorbeeld.nl/rss" }] }] }] }) : new Response("", { status: 404 })) as typeof fetch;
try {
  for (const fase of ["og", "art"]) for (const alles of [false, true]) {
    const kv = new Map<string, string>(), opslag = new Map<string, unknown>(), fouten: string[] = [], batches: string[] = [];
    console.error = (...args: unknown[]) => { fouten.push(args.join(" ")); };
    const storage = { get: async (k: string) => opslag.get(k), put: async (k: string, v: unknown) => { opslag.set(k, v); }, delete: async (k: string) => { opslag.delete(k); }, getAlarm: async () => null, setAlarm: async () => {} };
    const entries = Array.from({ length: 40 }, (_, i) => ({ t: `Nieuwsbericht onderwerp${String.fromCharCode(97 + Math.floor(i / 26))}${String.fromCharCode(97 + i % 26)} ontwikkeling${String.fromCharCode(97 + Math.floor(i / 26))}${String.fromCharCode(97 + i % 26)}`, l: `https://voorbeeld.nl/artikel/${i}`, s: "Een bericht met aanvullende informatie over de gebeurtenissen.", d: nu - i * 1000 }));
    const env: any = { SITE: "https://lokaal", NIEUWS: { get: async (k: string, type?: string) => { const v = kv.get(k); return type === "json" ? (v ? JSON.parse(v) : null) : v ?? null; }, put: async (k: string, v: string) => { kv.set(k, v); } }, FETCHER: { idFromName: (x: string) => x, get: (id: string) => ({ fetch: async (_u: string, init: RequestInit) => {
      const jobs = JSON.parse(init.body as string).jobs;
      if (id.startsWith(fase)) { batches.push(id); if ((fase === "art" || alles) && (alles || id === `${fase}0`)) { if (id.endsWith("0")) throw new Error("afgebroken"); return new Response("ongeldige json"); } }
      return Response.json(jobs.map((j: any) => j.kind === "feed" ? { url: j.url, ok: true, status: 200, ms: 1, entries, videos: [] } : { url: j.url, ok: true, status: 200, ms: 1, text: "https://voorbeeld.nl/foto.jpg", json: ["Artikeltekst ".repeat(40)] }));
    } }) } };
    const runner = new Runner({ storage, blockConcurrencyWhile: async (fn: () => Promise<unknown>) => fn() } as any, env);
    const antwoord = await runner.fetch(new Request("https://do/run"));
    assert.equal(antwoord.status, 200);
    assert.ok(batches.includes(`${fase}0`));
    assert.equal(batches.includes(`${fase}1`), fase === "art", `batches voor ${fase}: ${batches}`);
    const uur = JSON.parse(kv.get("uur")!);
    assert.ok(uur.items.length > 30);
    assert.equal(fouten.some((f) => f.includes(`fase=${fase} batch=0`)), fase === "art" || alles);
    if (fase === "art") assert.equal(fouten.some((f) => f.includes(`fase=${fase} batch=1`)), alles);
    if (fase === "og") assert.equal(uur.items.some((i: any) => i.beelden?.includes("https://voorbeeld.nl/foto.jpg")), !alles);
    else {
      const meta = uur.meta.leesVerder;
      assert.equal(meta.artikelenMetTekst > 0, !alles);
      assert.ok(meta.artikelFouten.batch0);
      assert.equal(Boolean(meta.artikelFouten.batch1), alles);
      assert.equal(meta.artikelenZonderTekst, alles ? meta.artikelenOpgehaald : 30);
    }
  }
  for (const fase of ["og", "art"] as const) {
    const logs: string[] = [];
    console.error = (...args: unknown[]) => { logs.push(args.join(" ")); };
    const env: any = { FETCHER: { idFromName: (id: string) => id, get: (id: string) => ({ fetch: async () => id.endsWith("0") ? new Response("ongeldige json") : Response.json([{ url: "https://voorbeeld.nl/twee", ok: true, ms: 1 }]) }) } };
    const uit = await haalArtikelBatches(env, fase, [[{ url: "https://voorbeeld.nl/een", kind: fase }], [{ url: "https://voorbeeld.nl/twee", kind: fase }]], 0);
    assert.deepEqual(uit.uit.map((r) => r.url), ["https://voorbeeld.nl/twee"]);
    assert.deepEqual(uit.mislukt, [0]);
    assert.ok(logs.some((l) => l.includes(`fase=${fase} batch=0`)));
  }
  console.log("ok - mislukte artikelbatches blijven geïsoleerd bij gedeeltelijke en volledige uitval");
} finally { globalThis.fetch = echteFetch; Date.now = echteNow; console.error = echteError; }
