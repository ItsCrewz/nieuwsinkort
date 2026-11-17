// #572: 403/404 van één bron stopt de run niet en de HTTP-status komt in de bronfout; CISA/BleepingComputer krijgen bij 403 browser-headers.
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { Runner, runJob, hostHeaders } from "../worker/src/index";

Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });

const echte = globalThis.fetch;
const rss = `<?xml version="1.0"?><rss version="2.0"><channel><item><title>Kwetsbaarheid</title><link>https://www.cisa.gov/a</link><pubDate>${new Date().toUTCString()}</pubDate></item></channel></rss>`;
const oudeTimeout = globalThis.setTimeout;
try {
  // sleep() wachten overslaan
  (globalThis as any).setTimeout = (f: any) => oudeTimeout(f, 0);
  let cisaAantal = 0;
  const gezien: Record<string, string>[] = [];
  globalThis.fetch = (async (u: any, init: any) => {
    const h = init?.headers || {};
    gezien.push(h);
    if (String(u).includes("bleepingcomputer")) return new Response("", { status: 403 });
    if (String(u).includes("cisa.gov")) { cisaAantal++; return h["User-Agent"]?.startsWith("Mozilla") && h.Referer && /rss/.test(h.Accept || "") ? new Response(rss) : new Response("", { status: 403 }); }
    return new Response("", { status: 404 });
  }) as any;

  const bleeping = await runJob({ url: "https://www.bleepingcomputer.com/feed/", kind: "feed" }, 0);
  assert.equal(bleeping.ok, false);
  assert.equal(bleeping.code, "SRC_HTTP");
  assert.equal(bleeping.status, 403);
  assert.equal(bleeping.err, "HTTP 403");

  const cisa = await runJob({ url: "https://www.cisa.gov/news.xml", kind: "feed" }, 0);
  assert.equal(cisa.ok, true, "CISA komt binnen met browser-headers");
  assert.equal(cisa.total, 1);
  // Alleen de retry-logica: eerste verzoek standaard-UA (403), tweede browser-UA + Referer + RSS-Accept (200).
  // Niet live tegen echte CISA/Akamai geverifieerd; of de headers daar werken is onbekend.
  assert.equal(cisaAantal, 2);
  const cisaH = gezien.filter((_, i) => i >= gezien.length - 2);
  assert.ok(!cisaH[0]["User-Agent"].startsWith("Mozilla") && !cisaH[0].Referer, "eerst standaard-UA");
  assert.equal(cisaH[1].Referer, "https://www.cisa.gov/");
  assert.match(cisaH[1].Accept, /rss/);

  const weg = await runJob({ url: "https://anders.nl/rss", kind: "feed" }, 0);
  assert.equal(weg.status, 404);
  assert.equal(weg.code, "SRC_HTTP");

  assert.deepEqual(hostHeaders("https://anders.nl/rss"), {});
  assert.match(hostHeaders("https://www.cisa.gov/x.json").Accept, /^application\/json/);
  // Hele keten: één bron 403 (ook na retry), een andere bron levert; run gaat door en status staat in run-status.bronfouten.
  globalThis.setTimeout = oudeTimeout; // echte timers: de batch-timeout van de Runner mag niet direct afgaan
  const bronnen = [["bleeping", "https://www.bleepingcomputer.com/feed/"], ["goed", "https://goed.nl/rss"]];
  globalThis.fetch = (async (u: any) => {
    const url = String(u);
    if (url.includes("/bronnen.json")) return Response.json({ groepen: [{ id: "nl", bronnen: bronnen.map(([id, feed]) => ({ id, naam: id, feeds: [{ url: feed }] })) }] });
    if (url.includes("bleepingcomputer")) return new Response("", { status: 403 });
    if (url.includes("goed.nl")) return new Response(`<?xml version="1.0"?><rss version="2.0"><channel><item><title>Gemeente opent nieuwe brug over de rivier</title><link>https://goed.nl/a</link><pubDate>${new Date().toUTCString()}</pubDate></item></channel></rss>`);
    return new Response("", { status: 404 });
  }) as any;
  const kv = new Map<string, string>();
  const opslag = new Map<string, any>();
  const env: any = { SITE: "https://lokaal", MODEL: "m", NIEUWS: { get: async (k: string, type?: string) => { const v = kv.get(k); return v == null ? null : type === "json" ? JSON.parse(v) : v; }, put: async (k: string, v: string) => { kv.set(k, v); } }, FETCHER: { idFromName: (x: string) => x, get: () => ({ fetch: async (_u: string, init: any) => Response.json(await Promise.all(JSON.parse(init.body).jobs.map((j: any) => bronnen.some(([, f]) => f === j.url) ? runJob(j, 0) : { url: j.url, ok: true, status: 200, ms: 1, entries: [], videos: [] }))) }) } };
  const ctx: any = { storage: { get: async (k: string) => opslag.get(k), put: async (k: string | Record<string, any>, v?: any) => { if (typeof k === "string") opslag.set(k, v); else for (const [key, waarde] of Object.entries(k)) opslag.set(key, waarde); }, delete: async (k: string) => opslag.delete(k), getAlarm: async () => null, setAlarm: async () => {} }, blockConcurrencyWhile: async (fn: any) => fn() };
  const oudeError = console.error; console.error = () => {};
  let antwoord: Response;
  try { antwoord = await new Runner(ctx, env).fetch(new Request("https://do/run")); } finally { console.error = oudeError; }
  assert.equal(antwoord.status, 200, "run gaat door ondanks 403 van één bron");
  const fouten = JSON.parse(kv.get("run-status")!).bronfouten;
  assert.equal(fouten.length, 1, "alleen de falende bron staat in bronfouten");
  assert.equal(fouten[0].code, "SRC_HTTP");
  assert.equal(fouten[0].status, 403);
  assert.match(fouten[0].url, /bleepingcomputer/);
  assert.ok(kv.get("uur"), "werkende bron levert uur-data");

  console.log("✓ 403/404 geeft foutcode en status; run gaat door; CISA krijgt browser-headers");
} finally { globalThis.fetch = echte; globalThis.setTimeout = oudeTimeout; }
