// #465/#466: KV-rem bij runs elke 5 minuten (publicatie hooguit elke 10 minuten, dagrem) en tc:-terugval bij een mislukte niet-core fetch. Nep-KV, nep-opslag, vaste klok, geen netwerk.
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { Runner } from "../worker/src/index";
import { ytUrl, YT_NIEUWS } from "../worker/src/videos";
import { moetPubliceren, publiceerInterval, uurInhoud, leesKvDag, telKvDag, HARTSLAG_MS, PUBLICEER_MIN_MS } from "../worker/src/opslag";

Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
let n = 0;
const echteLog = console.log;
const t = async (naam: string, fn: () => Promise<void>) => { await fn(); n++; echteLog("✓", naam); };
const MIN = 60e3;
const T0 = Date.parse("2026-11-02T09:00:00Z");
let klok = T0;
const echteNow = Date.now, echteFetch = globalThis.fetch;
Date.now = () => klok;
console.log = () => {};

function nepKv() {
  const m = new Map<string, string>(), puts: string[] = [];
  return { m, puts, get: async (k: string, type?: string) => { const v = m.get(k) ?? null; return type === "json" ? (v ? JSON.parse(v) : null) : v; }, put: async (k: string, v: string) => { puts.push(k); m.set(k, v); }, delete: async (k: string) => { m.delete(k); } };
}
function nepOpslag() {
  const m = new Map<string, unknown>();
  let alarm: number | null = null;
  return { m, get: async (k: string) => (m.has(k) ? structuredClone(m.get(k)) : undefined), put: async (k: any, v?: unknown) => { if (typeof k === "string") m.set(k, structuredClone(v)); else for (const [a, b] of Object.entries(k)) m.set(a, structuredClone(b)); }, delete: async (k: string) => { m.delete(k); }, getAlarm: async () => alarm, setAlarm: async (a: number) => { alarm = a; } };
}
const e = (slug: string, titel: string, min: number) => ({ t: titel, l: `https://nu.test/binnenland/${slug}`, s: "", d: T0 + min * MIN });
const bronnen = { groepen: [{ id: "nl", bronnen: [{ id: "nu", naam: "NU.nl", feeds: [{ url: "https://nu.test/rss" }] }] }] };
const TITELS = ["Kabinet praat over begroting", "Brand verwoest loods Rotterdam", "Voetbalclub wint bekerfinale Ajax", "Storm trekt over Noordzee kust", "Rechter veroordeelt oplichter ziekenhuis", "Nieuwe museum opent Amsterdam deuren", "Spoorstaking legt treinverkeer plat", "Onderzoek toont zorgen over huizenprijzen", "Wetenschappers ontdekken nieuwe planeet", "Politie arresteert verdachte inbraak Utrecht", "Boeren demonstreren tegen stikstofplannen", "Schaatser breekt wereldrecord Heerenveen", "Staking luchthaven Schiphol bagagepersoneel"];
const YT = Object.values(YT_NIEUWS).map((c) => ytUrl(c));
const video = { titel: "Filmpje", ai: "", bron: "YT", href: "https://www.youtube.com/watch?v=abc", thumb: "https://img.test/a.jpg", populariteit: "", tijd: "" };

function harnas() {
  const kv = nepKv(), opslag = nepOpslag();
  const feed = { entries: [] as any[], ytFout: false };
  const env: any = {
    SITE: "https://lokaal", MODEL: "m", NIEUWS: kv,
    FETCHER: { idFromName: (x: string) => x, get: () => ({ fetch: async (_u: string, init: any) => Response.json(JSON.parse(init.body).jobs.map((j: any) => {
      if (j.kind === "og") return { url: j.url, ok: true, status: 200, ms: 1, text: `https://img.test/${encodeURIComponent(j.url)}.jpg` };
      if (j.url === "https://nu.test/rss") return { url: j.url, ok: true, status: 200, ms: 1, entries: feed.entries, videos: [] };
      if (YT.includes(j.url)) return feed.ytFout ? { url: j.url, ok: false, status: 500, ms: 1, err: "HTTP 500" } : { url: j.url, ok: true, status: 200, ms: 1, entries: [], videos: j.url === YT[0] ? [video] : [] };
      return { url: j.url, ok: true, status: 200, ms: 1, entries: [], videos: [] };
    })) }) },
  };
  const r = new Runner({ storage: opslag, blockConcurrencyWhile: async (fn: () => Promise<unknown>) => fn() } as any, env);
  globalThis.fetch = (async (u: any) => {
    const url = String(u);
    if (url.includes("/bronnen.json")) return Response.json(bronnen);
    if (url.includes("/data.json?statisch=1")) return Response.json({ gegenereerd: new Date(T0 - 240 * MIN).toISOString(), items: [], filmpjes: [], dumpert: [] });
    return new Response("nee", { status: 404 });
  }) as any;
  const run = async (min: number, gepland = true) => {
    klok = T0 + min * MIN;
    const voor = kv.puts.length;
    const res = await r.fetch(new Request(`https://do/run${gepland ? `?gepland=${klok}` : ""}`));
    return { body: (await res.json()) as any, kvPuts: kv.puts.slice(voor) };
  };
  return { kv, opslag, feed, run };
}

try {
  await t("moetPubliceren: gewijzigde hash pas na het interval, hartslag altijd, klok terug", async () => {
    assert.equal(moetPubliceren(undefined, "a", T0, PUBLICEER_MIN_MS), true);
    assert.equal(moetPubliceren({ at: T0, h: "a" }, "b", T0 + 5 * MIN, PUBLICEER_MIN_MS), false);
    assert.equal(moetPubliceren({ at: T0, h: "a" }, "b", T0 + 10 * MIN, PUBLICEER_MIN_MS), true);
    assert.equal(moetPubliceren({ at: T0, h: "a" }, "a", T0 + 20 * MIN, PUBLICEER_MIN_MS), false);
    assert.equal(moetPubliceren({ at: T0, h: "a" }, "b", T0 + 40 * MIN, Infinity), false);
    assert.equal(moetPubliceren({ at: T0, h: "a" }, "b", T0 + HARTSLAG_MS, Infinity), true);
    assert.equal(moetPubliceren({ at: T0 + MIN, h: "a" }, "a", T0, PUBLICEER_MIN_MS), true);
  });

  await t("publiceerInterval en dagteller: 10 min, boven 650 30 min, boven 850 alleen hartslag; teller reset per UTC-dag", async () => {
    assert.deepEqual([0, 650, 651, 850, 851].map(publiceerInterval), [10 * MIN, 10 * MIN, 30 * MIN, 30 * MIN, Infinity]);
    const o = nepOpslag();
    assert.equal(await telKvDag(o, "2026-11-02", 5), 5);
    assert.equal(await telKvDag(o, "2026-11-02", 3), 8);
    assert.equal(await leesKvDag(o, "2026-11-03"), 0);
    assert.equal(await telKvDag(o, "2026-11-03", 2), 2);
  });

  await t("5-minutenruns met elke run een nieuw bericht: uur/data-vooraf hooguit elke 10 minuten, meer elke 30; niets blijft achter", async () => {
    const h = harnas();
    const alle: any[] = [];
    for (let i = 0; i <= 12; i++) {
      alle.push(e(`b${i}`, TITELS[i], i * 5 - 3));
      h.feed.entries = [...alle];
    }
    h.feed.entries = [alle[0]];
    const per: string[][] = [];
    for (let i = 0; i <= 12; i++) { h.feed.entries = alle.slice(0, i + 1); per.push((await h.run(i * 5)).kvPuts); }
    const uurN = per.flat().filter((k) => k === "uur").length, meerN = per.flat().filter((k) => k === "meer").length;
    assert.ok(uurN <= 7, `uur ${uurN}x in 60 minuten (was 13)`);
    assert.ok(meerN <= 3, `meer ${meerN}x`);
    assert.deepEqual(per[1], [], "run na 5 minuten: niets");
    assert.ok(per[2].includes("uur"), "na 10 minuten mag het weer");
    // de laatst toegestane run publiceert de actuele stand: stilstaande feed, na het interval staat alles in uur
    const r = await h.run(75);
    assert.ok(JSON.parse(h.kv.m.get("uur")!).items.length >= 10, "alle berichten staan in uur");
    assert.ok(r.body.kvWritesDag > 0 && r.body.publiceerInterval === 10);
  });

  await t("dagrem: boven 650 writes 30 minuten, boven 850 alleen de hartslag; kvWritesDag en publiceerInterval in meta", async () => {
    for (const [dag, interval, verwacht] of [[700, 30, "30 min"], [900, "hartslag", "hartslag"]] as const) {
      const h = harnas();
      h.opslag.m.set("kvDag", { dag: "2026-11-02", n: dag });
      h.feed.entries = [e("a", "Eerste bericht over de begroting van het kabinet", -10)];
      const r0 = await h.run(0);
      assert.equal(r0.body.publiceerInterval, interval, verwacht);
      assert.ok(r0.body.kvWritesDag >= dag);
      h.feed.entries = [...h.feed.entries, e("b", "Tweede bericht over brand in de haven van Rotterdam", -1)];
      const r1 = await h.run(10), r2 = await h.run(29), r3 = await h.run(49);
      assert.ok(!r1.kvPuts.includes("uur") && !r2.kvPuts.includes("uur"), "binnen het remrooster geen uur");
      if (dag === 700) assert.ok((await h.run(31)).kvPuts.includes("uur"), "na 30 minuten wel");
      else {
        assert.ok(!r3.kvPuts.includes("uur"), "boven 850 pas na de hartslag");
        assert.ok((await h.run(51)).kvPuts.includes("uur"), "hartslag na 50 minuten");
      }
      assert.ok((await leesKvDag(h.opslag, "2026-11-02")) > dag, "dagteller loopt door");
    }
  });

  await t("mislukte YouTube-fetch in een 15-run valt terug op tc: van vandaag: uur-hash gelijk, geen uur-write, fout alleen in laatsteFout", async () => {
    const h = harnas();
    h.feed.entries = [e("een", "Kabinet praat over de begroting van volgend jaar", -20)];
    const r0 = await h.run(0); // :00 = tier 30: YouTube haalt op en vult tc:
    assert.ok(r0.kvPuts.includes("uur"));
    const uur0 = JSON.parse(h.kv.m.get("uur")!);
    assert.equal(uur0.bronstats["filmpjes|youtube"].vandaag, 1);
    h.feed.ytFout = true;
    const r1 = await h.run(15); // :15 = tier 15: YouTube draait mee en faalt
    assert.deepEqual(r1.kvPuts, [], "geen KV-write door de mislukte fetch");
    const r2 = await h.run(20);
    assert.deepEqual(r2.kvPuts, []);
    // zelfde bronstats-hash als bij een geslaagde fetch, de fout blijft buiten de hash
    const metFout = { ...uur0, bronstats: { ...uur0.bronstats, "filmpjes|youtube": { ...uur0.bronstats["filmpjes|youtube"], laatsteFout: "HTTP 500" } } };
    assert.equal(uurInhoud(metFout), uurInhoud(uur0));
    // na de hartslag staat de video er nog en toont bronstats de fout
    const r3 = await h.run(60); // tier 30: faalt opnieuw, hartslag
    assert.ok(r3.kvPuts.includes("uur"));
    const uur3 = JSON.parse(h.kv.m.get("uur")!);
    assert.equal(uur3.bronstats["filmpjes|youtube"].vandaag, 1);
    assert.equal(uur3.bronstats["filmpjes|youtube"].laatsteFout, "HTTP 500");
    assert.equal(uur3.bronstats["filmpjes|youtube"].fout, undefined);
    assert.deepEqual(uur3.filmpjes, uur0.filmpjes);
  });

  await t("zonder tc: van vandaag blijft een mislukte fetch gewoon een fout (vandaag: null)", async () => {
    const h = harnas();
    h.feed.entries = [e("een", "Kabinet praat over de begroting van volgend jaar", -20)];
    h.feed.ytFout = true;
    await h.run(0);
    assert.equal(JSON.parse(h.kv.m.get("uur")!).bronstats["filmpjes|youtube"].vandaag, null);
  });
} finally {
  Date.now = echteNow;
  globalThis.fetch = echteFetch;
  console.log = echteLog;
}
console.log(`\n${n} kv-rem-tests geslaagd`);
