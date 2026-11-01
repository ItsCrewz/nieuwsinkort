// #452: KV alleen bij wijziging, state/caches/vooraf-log in DO-opslag. Nep-KV die puts telt, nep-DO-opslag, vaste klok, geen netwerk.
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import worker, { Runner, Fetcher } from "../worker/src/index";
import { BR_URL, KNMI_VERW } from "../worker/src/weer";
import { moetSchrijven, uurInhoud, splitState, schrijfState, kvStateWint, ruimOg, HARTSLAG_MS, OG_MAX, DEEL_MAX } from "../worker/src/opslag";
import type { LlmState } from "../worker/src/llm";

Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
let n = 0;
const echteLog = console.log;
const t = async (naam: string, fn: () => Promise<void>) => { await fn(); n++; echteLog("✓", naam); };
const MIN = 60e3;
const T0 = Date.parse("2026-11-02T09:00:00Z"); // 10:00 Amsterdam
let klok = T0;
const echteNow = Date.now, echteFetch = globalThis.fetch;
Date.now = () => klok;
console.log = () => {};

function nepKv() {
  const m = new Map<string, string>(), puts: string[] = [];
  return { m, puts, get: async (k: string, type?: string) => { const v = m.get(k) ?? null; return type === "json" ? (v ? JSON.parse(v) : null) : v; }, put: async (k: string, v: string) => { puts.push(k); m.set(k, v); }, delete: async (k: string) => { m.delete(k); } };
}
function nepOpslag() {
  const m = new Map<string, unknown>(), puts: string[] = [];
  let alarm: number | null = null;
  return { m, puts, get: async (k: string) => (m.has(k) ? structuredClone(m.get(k)) : undefined), put: async (k: string, v: unknown) => { puts.push(k); m.set(k, structuredClone(v)); }, delete: async (k: string) => { m.delete(k); }, getAlarm: async () => alarm, setAlarm: async (a: number) => { alarm = a; } };
}

const iso = (min: number) => new Date(T0 + min * MIN).toISOString();
const e = (slug: string, titel: string, min: number) => ({ t: titel, l: `https://nu.test/binnenland/${slug}`, s: "", d: T0 + min * MIN });
const bronnen = { groepen: [{ id: "nl", bronnen: [{ id: "nu", naam: "NU.nl", feeds: [{ url: "https://nu.test/rss" }] }] }] };

/** Eén Runner met nep-KV, nep-opslag en nep-Fetchers; `feed` bepaalt wat de feed op dit moment levert. */
function harnas(opties: { kvStart?: Record<string, string> } = {}) {
  const kv = nepKv(), opslag = nepOpslag();
  for (const [k, v] of Object.entries(opties.kvStart || {})) kv.m.set(k, v);
  const feed: { entries: any[]; br: any; knmi: string | null } = { entries: [], br: null, knmi: null };
  const ogJobs: string[] = [];
  const env: any = {
    SITE: "https://lokaal", MODEL: "m", NIEUWS: kv,
    FETCHER: { idFromName: (x: string) => x, get: () => ({ fetch: async (_u: string, init: any) => Response.json(JSON.parse(init.body).jobs.map((j: any) => {
      if (j.kind === "og") { ogJobs.push(j.url); return { url: j.url, ok: true, status: 200, ms: 1, text: `https://img.test/${encodeURIComponent(j.url)}.jpg` }; }
      if (j.url === BR_URL && feed.br) return { url: j.url, ok: true, status: 200, ms: 1, json: feed.br };
      if (j.url === KNMI_VERW && feed.knmi) return { url: j.url, ok: true, status: 200, ms: 1, text: feed.knmi };
      if (j.url === "https://nu.test/rss") return { url: j.url, ok: true, status: 200, ms: 1, entries: feed.entries, videos: [] };
      return { url: j.url, ok: true, status: 200, ms: 1, entries: [], videos: [] };
    })) }) },
  };
  const ctx: any = { storage: opslag, blockConcurrencyWhile: async (fn: () => Promise<unknown>) => fn() };
  const r = new Runner(ctx, env);
  const statisch = { gegenereerd: iso(-240), items: [], filmpjes: [], dumpert: [] };
  globalThis.fetch = (async (u: any) => {
    const url = String(u);
    if (url.includes("/bronnen.json")) return Response.json(bronnen);
    if (url.includes("/data.json?statisch=1")) return Response.json(statisch);
    return new Response("nee", { status: 404 });
  }) as any;
  const run = async (min: number, pad = "/run") => {
    klok = T0 + min * MIN;
    const kvVoor = kv.puts.length;
    const res = await r.fetch(new Request(`https://do${pad}`));
    return { res, body: (await res.json()) as any, kvPuts: kv.puts.slice(kvVoor) };
  };
  return { r, kv, opslag, env, ctx, feed, ogJobs, run };
}

try {
  await t("moetSchrijven: nieuw, andere inhoud, hartslag van 50 minuten en teruggelopen klok", async () => {
    assert.equal(moetSchrijven(undefined, "a", T0), true);
    assert.equal(moetSchrijven({ at: T0, h: "a" }, "a", T0 + 49 * MIN + 59e3), false);
    assert.equal(moetSchrijven({ at: T0, h: "a" }, "a", T0 + HARTSLAG_MS), true);
    assert.equal(moetSchrijven({ at: T0, h: "a" }, "b", T0 + MIN), true);
    assert.equal(moetSchrijven({ at: T0 }, undefined, T0 + MIN), false);
    assert.equal(moetSchrijven({ at: T0 + MIN, h: "a" }, "a", T0), true);
    assert.equal(moetSchrijven({ at: T0, h: "a" }, "a", T0 + 23 * 3600e3, 24 * 3600e3), false);
  });

  await t("uurInhoud: gegenereerd, meta, bronstats-ok en weer.bijgewerkt tellen niet mee; echte inhoud wel", async () => {
    const basis = (g: string, ok: string, bij: string, extra = {}) => ({ datum: "d", gegenereerd: g, meta: { x: g }, tab_samenvatting: { nl: { tekst: "t", ai: false, bron: "extractief", gegenereerd: g } }, weer: { bijgewerkt: bij, nu: { temp: 9 } }, items: [{ kop: "a" }], bronstats: { "nl|nu": { vandaag: 3, ok, laatste: "l" } }, ...extra });
    assert.equal(uurInhoud(basis("1", "o1", "10:00")), uurInhoud(basis("2", "o2", "10:05")));
    assert.notEqual(uurInhoud(basis("1", "o1", "10:00")), uurInhoud(basis("1", "o1", "10:00", { items: [{ kop: "b" }] })));
    // #461: de snel wisselende weervelden (nu, vandaag) tellen niet mee; verwachting, dagen en waarschuwing wel
    const metWeer = (weer: any) => ({ ...basis("1", "o1", "10:00"), weer });
    const w = { bijgewerkt: "10:00", nu: { temp: 9 }, vandaag: { max: 12, neerslagkans: 20 }, dagen: [{ dag: "ma", min: 3, max: 9 }], verwachting: "Droog.", waarschuwing: "" };
    assert.equal(uurInhoud(metWeer(w)), uurInhoud(metWeer({ ...w, bijgewerkt: "10:10", nu: { temp: 10 }, vandaag: { max: 12, neerslagkans: 60 } })));
    assert.notEqual(uurInhoud(metWeer(w)), uurInhoud(metWeer({ ...w, waarschuwing: "Code oranje: onweer" })));
    assert.notEqual(uurInhoud(metWeer(w)), uurInhoud(metWeer({ ...w, verwachting: "Regen." })));
    assert.notEqual(uurInhoud(metWeer(w)), uurInhoud(metWeer({ ...w, dagen: [{ dag: "ma", min: 3, max: 10 }] })));
  });

  await t("state splitsen: alleen gewijzigde delen worden geschreven, verdwenen delen gewist", async () => {
    const o = nepOpslag();
    const st: any = { datum: "d", neurons: 1, sums: { a: 1 }, links: {}, art: { x: ["p"] }, llm: {} };
    assert.equal(await schrijfState(o, st, {}), 5);
    const vorige = Object.fromEntries([...o.m].map(([k, v]) => [k, v as string]));
    assert.equal(await schrijfState(o, { ...st }, vorige), 0);
    o.puts.length = 0;
    assert.equal(await schrijfState(o, { ...st, neurons: 2 }, vorige), 1);
    assert.deepEqual(o.puts, ["st:rest"]);
    const { art: _a, ...zonderArt } = st;
    assert.equal(await schrijfState(o, zonderArt, vorige), 1);
    assert.equal(o.m.has("st:art"), false);
    assert.deepEqual(Object.keys(splitState(st)).sort(), ["st:art", "st:links", "st:llm", "st:rest", "st:sums"]);
  });

  await t("ruimOg: ouder dan 3 dagen eruit en begrensd op de nieuwste regels", async () => {
    const c: Record<string, [string, number]> = { oud: ["x", T0 - 3 * 86400e3 - 1], vers: ["y", T0 - 3 * 86400e3 + 1] };
    assert.deepEqual(Object.keys(ruimOg(c, T0)), ["vers"]);
    const veel = Object.fromEntries(Array.from({ length: OG_MAX + 10 }, (_, i) => [`k${i}`, ["i", T0 - i] as [string, number]]));
    const r = ruimOg(veel, T0);
    assert.equal(Object.keys(r).length, OG_MAX);
    assert.ok(r.k0 && !r[`k${OG_MAX + 5}`]);
  });

  await t("runs om de 5 minuten: zelfde inhoud = 0 KV-writes, nieuw bericht = uur + data-vooraf, hartslag na 50+ minuten", async () => {
    const h = harnas();
    h.feed.entries = [e("een", "Kabinet praat over de begroting van volgend jaar", -20)];
    const r1 = await h.run(0);
    assert.equal(r1.res.status, 200);
    for (const k of ["uur", "state", "meer", "data-vooraf"]) assert.ok(r1.kvPuts.includes(k), `run 1 schrijft ${k}`);
    assert.ok(r1.body.kvSleutels.includes("uur") && r1.body.kvSleutels.includes("data-vooraf"));
    assert.equal(r1.body.kvWritesRun, 4);
    assert.equal(JSON.parse(h.kv.m.get("uur")!).meta.kvWritesRun, 4);
    assert.ok(JSON.parse(h.kv.m.get("uur")!).items.length === 1);
    h.opslag.puts.length = 0;
    const r2 = await h.run(5);
    assert.deepEqual(r2.kvPuts, [], "run 2: zelfde inhoud, geen enkele KV-write");
    assert.equal(r2.body.kvWritesRun, 0);
    assert.ok(h.opslag.puts.includes("st:rest") && !h.opslag.puts.includes("st:sums") && !h.opslag.puts.includes("st:links"), "onveranderde state-delen blijven staan");
    assert.equal(h.ogJobs.length, 1, "og-link wordt maar één keer opgehaald");
    h.feed.entries = [...h.feed.entries, e("twee", "Brand in havengebied verwoest loods", -3)];
    const r3 = await h.run(10);
    assert.deepEqual([...r3.kvPuts].sort(), ["data-vooraf", "uur"], "run 3: nieuw bericht schrijft uur en data-vooraf, geen state (<50 min) en geen meer");
    assert.equal(JSON.parse(h.kv.m.get("uur")!).items.length, 2);
    const r4 = await h.run(15);
    assert.deepEqual(r4.kvPuts, []);
    const r5 = await h.run(61);
    for (const k of ["uur", "state", "meer", "data-vooraf"]) assert.ok(r5.kvPuts.includes(k), `hartslag schrijft ${k}`);
    assert.equal(JSON.parse(h.kv.m.get("uur")!).gegenereerd, iso(61));
    const info: any = await (await h.r.fetch(new Request("https://do/info"))).json();
    assert.equal(info.tellers.length, 5);
    assert.deepEqual(info.tellers.map((x: any) => x.kv), [5, 0, 2, 0, 5], "tellerregels: KV-writes per run, incl. run-status bij de eerste run en de hartslag");
    assert.ok(info.tellers.every((x: any) => x.soort === "run" && x.doWrites > 0 && typeof x.at === "string"));
  });

  await t("uurlijks: runs 59:59 uit elkaar schrijven allebei uur, data-vooraf, state en meer; uur-inhoud (zonder meta) gelijk aan een verse run", async () => {
    const h = harnas();
    h.feed.entries = [e("een", "Kabinet praat over de begroting van volgend jaar", -20)];
    const r1 = await h.run(0);
    klok = T0 + 59 * MIN + 59e3;
    const kvVoor = h.kv.puts.length;
    const res = await h.r.fetch(new Request("https://do/run"));
    assert.equal(res.status, 200);
    const r2 = h.kv.puts.slice(kvVoor);
    for (const k of ["uur", "state", "meer", "data-vooraf"]) assert.ok(r1.kvPuts.includes(k) && r2.includes(k), `beide runs schrijven ${k}`);
    const uur2 = JSON.parse(h.kv.m.get("uur")!);
    // verse Runner (= gedrag van de oude code: alles schrijven) op hetzelfde tijdstip, zelfde feeds
    const vers = harnas();
    vers.feed.entries = h.feed.entries;
    klok = T0 + 59 * MIN + 59e3; { const k0 = vers.kv.puts.length; await vers.r.fetch(new Request("https://do/run")); assert.ok(vers.kv.puts.length > k0); }
    const { meta: _m1, ...a } = uur2, { meta: _m2, ...b } = JSON.parse(vers.kv.m.get("uur")!);
    assert.deepEqual(a, b);
    assert.equal(h.kv.m.get("data-vooraf")!.split("\n")[0], "2026-11-02");
  });

  const brFeed = (temp: number, kans = 20) => ({ actual: { stationmeasurements: [{ regio: "De Bilt", temperature: temp, feeltemperature: temp - 1, weatherdescription: "Zonnig" }] }, forecast: { fivedayforecast: [{ day: "2026-11-02T00:00:00", mintemperatureMin: 3, maxtemperatureMax: 11, rainChance: kans, wind: 3, windDirection: "zw", weatherdescription: "Zonnig" }] } });
  const knmiTekst = (waarschuwing: string) => `Vandaag & morgen Het blijft droog met zon.\nWaarschuwingen\n${waarschuwing}\n\n(Bron: KNMI)`;

  await t("#461 weer: runs om de 5 minuten waarbij alleen weer.nu wisselt = 0 KV-writes; hartslag schrijft het nieuwe weer; waarschuwing direct", async () => {
    const h = harnas();
    h.feed.entries = [e("een", "Kabinet praat over de begroting van volgend jaar", -20)];
    h.feed.br = brFeed(9);
    h.feed.knmi = knmiTekst("Er zijn geen waarschuwingen.");
    const r1 = await h.run(0);
    for (const k of ["uur", "data-vooraf"]) assert.ok(r1.kvPuts.includes(k));
    assert.equal(JSON.parse(h.kv.m.get("uur")!).weer.nu.temp, 9);
    h.feed.br = brFeed(10, 70); // nu én vandaag.neerslagkans wisselen
    const r2 = await h.run(5);
    assert.deepEqual(r2.kvPuts, [], "alleen weer.nu/vandaag anders: geen uur- of data-vooraf-write");
    h.feed.br = brFeed(11, 30);
    assert.deepEqual((await h.run(10)).kvPuts, []);
    assert.equal(JSON.parse(h.kv.m.get("uur")!).weer.nu.temp, 9, "KV houdt het weer van de laatste write");
    h.feed.knmi = knmiTekst("Onweer in het zuiden (code oranje)");
    const r4 = await h.run(15);
    assert.deepEqual([...r4.kvPuts].sort(), ["data-vooraf", "uur"], "waarschuwing gaat direct live");
    const uur4 = JSON.parse(h.kv.m.get("uur")!);
    assert.match(uur4.weer.waarschuwing, /oranje/i);
    assert.equal(uur4.weer.nu.temp, 11, "het weer gaat dan mee met de write");
    h.feed.br = brFeed(12);
    assert.deepEqual((await h.run(20)).kvPuts, []);
    const r6 = await h.run(66);
    assert.ok(r6.kvPuts.includes("uur") && r6.kvPuts.includes("data-vooraf"), "hartslag na ≥ 50 minuten");
    assert.equal(JSON.parse(h.kv.m.get("uur")!).weer.nu.temp, 12, "hartslag schrijft het nieuwe weer");
  });

  await t("#461 weer: uurlijks (59:59 uit elkaar) schrijven beide runs uur en data-vooraf, ook als alleen weer.nu wisselt", async () => {
    const h = harnas();
    h.feed.entries = [e("een", "Kabinet praat over de begroting van volgend jaar", -20)];
    h.feed.br = brFeed(9);
    await h.run(0);
    h.feed.br = brFeed(14);
    klok = T0 + 59 * MIN + 59e3;
    const voor = h.kv.puts.length;
    await h.r.fetch(new Request("https://do/run"));
    const r2 = h.kv.puts.slice(voor);
    assert.ok(r2.includes("uur") && r2.includes("data-vooraf"));
    assert.equal(JSON.parse(h.kv.m.get("uur")!).weer.nu.temp, 14);
  });

  await t("migratie: lege DO-opslag + KV state → de KV-state wordt gebruikt en daarna in DO-opslag bewaard", async () => {
    const link = "https://nu.test/binnenland/een";
    const kvState = { datum: "2026-11-02", neuronDag: "2026-11-02", neurons: 77, calls: 3, runs: 4, okAt: {}, hashes: {}, links: { "nu.test/binnenland/een": "x1" }, sums: { x1: { kop: "Samenvatting uit KV-state", ai: "Korte uitleg van het nieuws.", samenvatting: "Meer tekst over het nieuws van vandaag in het hele land.", punten: ["Een tweede feit"], at: T0 - MIN } } };
    const h = harnas({ kvStart: { state: JSON.stringify(kvState) } });
    h.feed.entries = [{ ...e("een", "Kabinet praat over de begroting van volgend jaar", -20), l: link }];
    const r1 = await h.run(0);
    const uur = JSON.parse(h.kv.m.get("uur")!);
    assert.equal(uur.items[0].kop, "Samenvatting uit KV-state");
    assert.ok(!uur.items[0].ruw, "niet opnieuw ruw/AI: de bewaarde samenvatting is hergebruikt");
    const rest: any = JSON.parse(h.opslag.m.get("st:rest") as string);
    assert.equal(rest.neurons, 77);
    assert.equal(rest.runs, 5);
    assert.ok(h.opslag.m.has("st:sums") && JSON.parse(h.opslag.m.get("st:sums") as string).x1);
    assert.ok(r1.kvPuts.includes("state"), "KV-kopie wordt de eerste keer geschreven");
    // tweede run: de KV-kopie wordt alleen gelezen en is niet nieuwer, dus DO-opslag blijft leidend
    await h.run(5);
    assert.equal(JSON.parse(h.opslag.m.get("st:rest") as string).runs, 6);
  });

  await t("#476 gecachete slechte som wordt genegeerd (ruw, geen AI zonder binding); een goede som blijft en extra KV-writes zijn er niet", async () => {
    const link = "https://nu.test/binnenland/een", titel = "Kabinet praat over de begroting van volgend jaar";
    const slecht = { kop: titel, ai: titel, samenvatting: "Kort antwoord", punten: ["Kabinet", "Kabinet"], at: T0 - MIN };
    const kvState = (som: object) => ({ datum: "2026-11-02", neuronDag: "2026-11-02", neurons: 0, calls: 0, runs: 1, okAt: {}, hashes: {}, links: { "nu.test/binnenland/een": "x1" }, sums: { x1: som } });
    const hS = harnas({ kvStart: { state: JSON.stringify(kvState(slecht)) } });
    hS.feed.entries = [{ ...e("een", titel, -20), l: link, s: "Het kabinet praat vandaag over de begroting. Er komt een besluit." }];
    await hS.run(0);
    const uurS = JSON.parse(hS.kv.m.get("uur")!);
    assert.equal(uurS.items[0].ruw, true, "slechte cache telt als afwezig: extractief");
    assert.ok(uurS.items[0].kop !== titel || !uurS.items[0].punten.length);
    const goed = { kop: "Kabinet bespreekt de begroting", ai: "Ministers overleggen vandaag over geld voor scholen en zorg.", samenvatting: "Het kabinet praat vandaag over de begroting. Er komt een besluit voor volgend jaar.", punten: ["Besluit volgt later", "Besluit volgt later"], at: T0 - MIN };
    const hG = harnas({ kvStart: { state: JSON.stringify(kvState(goed)) } });
    hG.feed.entries = hS.feed.entries;
    await hG.run(0);
    const it = JSON.parse(hG.kv.m.get("uur")!).items[0];
    assert.equal(it.kop, goed.kop);
    assert.ok(!it.ruw);
    assert.deepEqual(it.punten, ["Besluit volgt later"], "dubbel punt weggelaten");
    assert.ok(hG.kv.puts.every((k) => !/afgekeurd/i.test(k)), "geen nieuwe KV-sleutel");
  });

  await t("#476 afgekeurde AI-som (geen externe keten): extractief ruw, markering in DO-opslag, volgende runs geen AI meer voor dat cluster", async () => {
    const titel = "Privéjet crash in Florida";
    const h = harnas();
    let aiCalls = 0;
    h.env.AI = { run: async () => { aiCalls++; return { response: JSON.stringify({ items: [{ id: 1, kop: titel, ai: titel, samenvatting: "Negen inzittenden om het leven", punten: ["Florida", "Florida"] }] }) }; } };
    h.feed.entries = [{ ...e("een", titel, -20), l: "https://nu.test/nieuws/artikel/5662394/privejet", s: "Bij een vliegtuigcrash in een woonwijk in de Amerikaanse staat Florida zijn vandaag alle negen inzittenden om het leven gekomen." }];
    await h.run(0);
    await h.run(11);
    const uur = JSON.parse(h.kv.m.get("uur")!);
    const na1 = aiCalls;
    assert.ok(na1 >= 1, "AI is gebruikt");
    assert.equal(uur.items[0].ruw, true, "geen kapotte som getoond: extractief");
    assert.equal(uur.items[0].cat, "buitenland", "Florida in kop/omschrijving: Buitenland");
    assert.deepEqual(JSON.parse(h.opslag.m.get("st:sums") as string), {}, "geen som bewaard");
    assert.equal(Object.keys(JSON.parse(h.opslag.m.get("st:rest") as string).somAfgekeurd).length, 1);
    assert.equal(uur.meta.somOpgegeven, 1);
    await h.run(22);
    await h.run(33);
    assert.equal(aiCalls, na1, "afgekeurd cluster kost geen AI meer");
  });

  await t("state-KV: bij uurlijks elke run, daarna pas weer na 50 minuten; DO-state is altijd actueel", async () => {
    const h = harnas();
    h.feed.entries = [e("een", "Kabinet praat over de begroting van volgend jaar", -20)];
    await h.run(0);
    await h.run(5);
    await h.run(49);
    const stateKv = () => h.kv.puts.filter((k) => k === "state").length;
    assert.equal(stateKv(), 1);
    assert.equal(JSON.parse(h.opslag.m.get("st:rest") as string).runs, 3);
    await h.run(50);
    assert.equal(stateKv(), 2);
  });

  await t("bewaarLlmDo (mislukte run): Groq-stand komt in DO-state; KV-kopie alleen volgens de 50-minutenregel", async () => {
    const h = harnas();
    h.feed.entries = [e("een", "Kabinet praat over de begroting van volgend jaar", -20)];
    await h.run(0);
    const teller = (tokens: number): LlmState[string] => ({ dag: "2026-11-02", calls: 1, tokens, venster: [] });
    const tel = { opslag: h.opslag, kv: h.kv };
    klok = T0 + 5 * MIN;
    assert.equal(await (h.r as any).bewaarLlmDo(tel, {}, { "groq:m": teller(40) }), true);
    assert.equal(JSON.parse(h.opslag.m.get("st:llm") as string)["groq:m"].tokens, 40);
    assert.equal(h.kv.puts.filter((k) => k === "state").length, 1, "KV-state pas na 50 minuten");
    klok = T0 + 55 * MIN;
    assert.equal(await (h.r as any).bewaarLlmDo(tel, { "groq:m": teller(40) }, { "groq:m": teller(70) }), true);
    assert.equal(JSON.parse(h.opslag.m.get("st:llm") as string)["groq:m"].tokens, 70);
    const kvState = JSON.parse(h.kv.m.get("state")!);
    assert.equal(kvState.llm["groq:m"].tokens, 70);
    assert.equal(kvState.sums && typeof kvState.sums, "object", "volledige state in de KV-kopie");
    const leeg = harnas();
    assert.equal(await (leeg.r as any).bewaarLlmDo({ opslag: leeg.opslag, kv: leeg.kv }, {}, {}), false, "zonder state niets schrijven");
  });

  await t("bewaarLlmDo na halve DO-write: de KV-kopie is de basis, niet de halve DO-state (review-blokker 1)", async () => {
    const h = harnas();
    h.feed.entries = [e("een", "Kabinet praat over de begroting van volgend jaar", -20)];
    await h.run(0);
    const teller = (tokens: number): LlmState[string] => ({ dag: "2026-11-02", calls: 1, tokens, venster: [] });
    const oud = JSON.parse(h.opslag.m.get("st:rest") as string);
    // run A: st:rest is nieuw (stAt T1, neuronen), st:llm/st:at staan nog op T0; de KV-kopie van A is compleet
    const kvA = { ...JSON.parse(h.kv.m.get("state")!), stAt: oud.stAt + 1, neurons: oud.neurons + 10, llm: { "groq:m": teller(100) } };
    h.kv.m.set("state", JSON.stringify(kvA));
    h.opslag.m.set("st:rest", JSON.stringify({ ...oud, stAt: oud.stAt + 1, neurons: oud.neurons + 10 }));
    h.opslag.m.set("st:llm", JSON.stringify({ "groq:m": teller(10) }));
    klok = T0 + 5 * MIN;
    assert.equal(await (h.r as any).bewaarLlmDo({ opslag: h.opslag, kv: h.kv }, {}, { "groq:m": teller(40) }), true);
    assert.equal(JSON.parse(h.opslag.m.get("st:llm") as string)["groq:m"].tokens, 140, "llm van A (KV) + verschil van B");
    assert.equal(JSON.parse(h.opslag.m.get("st:rest") as string).neurons, kvA.neurons);
    assert.equal(h.opslag.m.get("st:at"), String(kvA.stAt));
    assert.ok(JSON.parse(h.opslag.m.get("st:sums") as string), "sums uit de KV-kopie");
  });

  await t("bewaarLlmDo telt niets bij als het verschil van deze run al in de state staat (review-blokker 2)", async () => {
    const h = harnas();
    h.feed.entries = [e("een", "Kabinet praat over de begroting van volgend jaar", -20)];
    await h.run(0);
    const teller = (tokens: number): LlmState[string] => ({ dag: "2026-11-02", calls: 1, tokens, venster: [] });
    const st = JSON.parse(h.opslag.m.get("st:rest") as string);
    // st:llm van de run is geschreven (verschil al bijgeteld), st:at en de KV-put faalden
    const llm = { "groq:m": teller(70) };
    h.opslag.m.set("st:llm", JSON.stringify(llm));
    h.opslag.m.set("st:rest", JSON.stringify({ ...st, stAt: T0 + 5 * MIN }));
    const puts = h.opslag.puts.length;
    const ok = await (h.r as any).bewaarLlmDo({ opslag: h.opslag, kv: h.kv }, {}, { "groq:m": teller(40) }, { stAt: T0 + 5 * MIN, llm: JSON.stringify(llm) });
    assert.equal(ok, true);
    assert.equal(JSON.parse(h.opslag.m.get("st:llm") as string)["groq:m"].tokens, 70, "niet dubbel geteld");
    assert.equal(h.opslag.puts.length, puts, "niets geschreven");
  });

  await t("schrijfState: te groot deel wordt niet geschreven (vorige blijft, gelogd); art/diep/artJ worden ingekort; st:rest eerst, st:llm laatst", async () => {
    const fouten: string[] = [], echt = console.error;
    console.error = (...a: unknown[]) => { fouten.push(a.join(" ")); };
    try {
      const o = nepOpslag();
      const groot = "x".repeat(DEEL_MAX + 10);
      const st: any = { datum: "d", neurons: 1, sums: { a: 1 }, links: { l: 1 }, art: {}, llm: { g: 1 }, ytEmbed: { v: groot } };
      st.art = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`k${i}`, ["y".repeat(150000)]]));
      await schrijfState(o, st, {});
      assert.equal(o.puts[0], "st:rest");
      assert.equal(o.puts[o.puts.length - 1], "st:llm");
      assert.ok(!o.m.has("st:ytEmbed"), "te groot deel niet geschreven");
      assert.ok(fouten.some((f) => f.includes("st:ytEmbed") && f.includes("te groot")));
      const art = JSON.parse(o.m.get("st:art") as string);
      assert.ok(Object.keys(art).length > 0 && Object.keys(art).length < 20 && !art.k0 && art.k19, "oudste regels vallen af");
      assert.ok((o.m.get("st:art") as string).length <= DEEL_MAX);
      // vorige DO-versie van een te groot deel blijft staan
      const vorige = Object.fromEntries([...o.m].map(([k, v]) => [k, v as string]));
      await o.put("st:ytEmbed", "\"oud\""); vorige["st:ytEmbed"] = "\"oud\"";
      await schrijfState(o, { ...st, neurons: 2 }, vorige);
      assert.equal(o.m.get("st:ytEmbed"), "\"oud\"");
      assert.equal(JSON.parse(o.m.get("st:rest") as string).neurons, 2);
    } finally { console.error = echt; }
  });

  await t("run met art > 1,8 MB: run slaagt, st:rest en andere delen geschreven, art ingekort, geen throw", async () => {
    const fouten: string[] = [], echt = console.error;
    console.error = (...a: unknown[]) => { fouten.push(a.join(" ")); };
    try {
      const h = harnas();
      h.feed.entries = [e("een", "Kabinet praat over de begroting van volgend jaar", -20)];
      await h.run(0);
      await h.opslag.put("st:art", JSON.stringify({ "nu.test/binnenland/een": ["x".repeat(DEEL_MAX + 100)] }, null, 1)); // andere opmaak: de run ziet het als gewijzigd
      const r = await h.run(5);
      assert.equal(r.res.status, 200);
      assert.equal(JSON.parse(h.opslag.m.get("st:rest") as string).runs, 2);
      assert.ok(h.opslag.m.has("st:sums") && h.opslag.m.has("st:links"));
      assert.ok(((h.opslag.m.get("st:art") as string) || "").length <= DEEL_MAX);
      assert.ok(fouten.some((f) => f.includes("st:art") && f.includes("te groot")));
    } finally { console.error = echt; }
  });

  await t("mislukte DO-state-write: run gaat door en de KV-kopie van state wordt toch geschreven (ook binnen 50 minuten)", async () => {
    const fouten: string[] = [], echt = console.error;
    console.error = (...a: unknown[]) => { fouten.push(a.join(" ")); };
    try {
      const h = harnas();
      h.feed.entries = [e("een", "Kabinet praat over de begroting van volgend jaar", -20)];
      await h.run(0);
      const put = h.opslag.put;
      h.opslag.put = async (k: string, v: unknown) => { if (k.startsWith("st:")) throw new Error("DO kapot"); return put(k, v); };
      const r = await h.run(5);
      h.opslag.put = put;
      assert.equal(r.res.status, 200);
      assert.ok(r.kvPuts.includes("state"), "KV-state toch geschreven");
      assert.equal(JSON.parse(h.kv.m.get("state")!).runs, 2);
      assert.ok(fouten.some((f) => f.includes("opslagfout state (DO)")));
      // de volgende run: KV-state is nieuwer (stAt) dan de verouderde DO-state en wint, dus runs loopt door
      await h.run(10);
      assert.equal(JSON.parse(h.opslag.m.get("st:rest") as string).runs, 3);
    } finally { console.error = echt; }
  });

  await t("terugrollen: KV-state zonder stAt met meer neuronen dan DO-state wint (sums en neuronen behouden, geen nieuwe AI-calls)", async () => {
    const dag = "2026-11-02", link = "https://nu.test/binnenland/een";
    const doRest = { datum: dag, neuronDag: dag, neurons: 100, calls: 1, runs: 1, okAt: {}, stAt: T0 - 60 * MIN };
    const kvState = { datum: dag, neuronDag: dag, neurons: 400, calls: 9, runs: 5, okAt: {}, hashes: {}, links: { "nu.test/binnenland/een": "x1" }, sums: { x1: { kop: "Samenvatting uit de oude Worker", ai: "Korte uitleg van het nieuws.", samenvatting: "Meer tekst over het nieuws van vandaag in het hele land.", punten: ["Een tweede feit"], at: T0 - MIN } } };
    const h = harnas({ kvStart: { state: JSON.stringify(kvState) } });
    await h.opslag.put("st:rest", JSON.stringify(doRest));
    h.feed.entries = [{ ...e("een", "Kabinet praat over de begroting van volgend jaar", -20), l: link }];
    await h.run(0);
    const uur = JSON.parse(h.kv.m.get("uur")!);
    assert.equal(uur.items[0].kop, "Samenvatting uit de oude Worker");
    const rest = JSON.parse(h.opslag.m.get("st:rest") as string);
    assert.ok(rest.neurons >= 400 && rest.runs === 6);
    assert.ok(JSON.parse(h.opslag.m.get("st:sums") as string).x1, "KV-sums naar DO-opslag overgenomen");
    // normaal bedrijf: KV gelijk of ouder = DO leidend
    assert.equal(kvStateWint({ neuronDag: dag, neurons: 400, stAt: 5 }, { neuronDag: dag, neurons: 400, stAt: 5 }), false);
    assert.equal(kvStateWint({ neuronDag: dag, neurons: 400, stAt: 5 }, { neuronDag: dag, neurons: 300, stAt: 4 }), false);
    assert.equal(kvStateWint({ neuronDag: dag, neurons: 400 }, { neuronDag: "2026-11-03", neurons: 0 }), true);
    assert.equal(kvStateWint({ neuronDag: "2026-11-03", neurons: 0 }, { neuronDag: dag, neurons: 900 }), false);
    assert.equal(kvStateWint({ neuronDag: dag, neurons: 400, stAt: 5 }, { neuronDag: dag, neurons: 400, stAt: 6 }), true);
  });

  const sumsVan = (kop: string, at: number) => ({ x1: { kop, ai: "Korte uitleg van het nieuws.", samenvatting: "Meer tekst over het nieuws van vandaag in het hele land.", punten: ["Een tweede feit"], at } });

  await t("halve DO-write (st:rest ja, st:sums faalt): volgende run kiest de KV-state, behoudt sums en llm, geen dubbele AI-calls; DO daarna compleet met st:at", async () => {
    const dag = "2026-11-02", link = "https://nu.test/binnenland/een", echt = console.error, fouten: string[] = [];
    console.error = (...a: unknown[]) => { fouten.push(a.join(" ")); };
    try {
      const llm = { "groq:m": { dag, calls: 2, tokens: 50, venster: [] } };
      const h = harnas();
      h.feed.entries = [{ ...e("een", "Kabinet praat over de begroting van volgend jaar", -20), l: link }];
      await h.run(0);
      assert.equal(await h.opslag.get("st:at"), String(T0));
      // run 2: DO-put van st:sums gooit na st:rest; de KV-kopie is van deze run
      const put = h.opslag.put;
      h.opslag.put = async (k: string, v: unknown) => { if (k === "st:sums") throw new Error("DO kapot"); return put(k, v); };
      await put("st:sums", JSON.stringify({ oud: { kop: "oud", at: T0 - 25 * 3600e3 } })); // wordt opgeruimd → st:sums wijzigt, de write faalt
      await h.run(5);
      assert.ok(fouten.some((f) => f.includes("opslagfout state (DO)")));
      h.opslag.put = put;
      const kv2 = JSON.parse(h.kv.m.get("state")!);
      assert.equal(kv2.stAt, T0 + 5 * MIN);
      assert.equal(await h.opslag.get("st:at"), String(T0), "commit-markering niet vernieuwd");
      kv2.llm = { ...kv2.llm, ...llm }; kv2.sums = { ...kv2.sums, ...sumsVan("Samenvatting van run 2", T0) }; kv2.links = { "nu.test/binnenland/een": "x1" };
      h.kv.m.set("state", JSON.stringify(kv2));
      const uur = await h.run(10);
      assert.equal(uur.body.ok, true);
      assert.equal(JSON.parse(h.kv.m.get("uur")!).items[0].kop, "Samenvatting van run 2", "sums uit KV behouden");
      assert.equal(JSON.parse(h.opslag.m.get("st:llm") as string)["groq:m"].calls, 2, "llm-verbruik behouden");
      assert.equal(JSON.parse(h.opslag.m.get("st:rest") as string).runs, 3);
      assert.equal(h.opslag.m.get("st:at"), String(T0 + 10 * MIN), "DO weer compleet");
      assert.ok(JSON.parse(h.opslag.m.get("st:sums") as string).x1);
    } finally { console.error = echt; }
  });

  await t("te groot onverkortbaar deel: st:at niet geschreven, status.volledig=false en KV wint (stAt nieuwer dan st:at)", async () => {
    const fouten: string[] = [], echt = console.error;
    console.error = (...a: unknown[]) => { fouten.push(a.join(" ")); };
    try {
      const o = nepOpslag(), status = { volledig: true };
      await schrijfState(o, { datum: "d", neurons: 1, stAt: 5, sums: { a: 1 } }, {});
      assert.equal(o.m.get("st:at"), "5");
      await schrijfState(o, { datum: "d", neurons: 2, stAt: 6, sums: { a: 1 }, ytEmbed: { v: "x".repeat(DEEL_MAX + 10) } }, Object.fromEntries([...o.m].map(([k, v]) => [k, v as string])), status);
      assert.equal(status.volledig, false);
      assert.equal(o.m.get("st:at"), "5", "markering blijft oud");
      assert.equal(kvStateWint({ datum: "d", neuronDag: "d", neurons: 2, stAt: 6 }, { datum: "d", neuronDag: "d", neurons: 2, stAt: 6 }, 5), true);
    } finally { console.error = echt; }
  });

  await t("terugrol-scenario: KV-state van de oude Worker met gelijke neuronen en stAt, maar meer runs en extra sums → KV wint", async () => {
    const dag = "2026-11-02", link = "https://nu.test/binnenland/een";
    const doSt = { datum: dag, neuronDag: dag, neurons: 100, runs: 3, stAt: 7, llm: {}, sums: {} };
    assert.equal(kvStateWint(doSt, { ...doSt, runs: 4 }, 7), true);
    assert.equal(kvStateWint(doSt, { ...doSt, llm: { g: { dag, calls: 1, tokens: 9, venster: [] } } }, 7), true);
    assert.equal(kvStateWint(doSt, { ...doSt, runs: 1, datum: "2026-11-01" }, 7), false, "andere datum: runs vergelijkt niet");
    const doRest = { datum: dag, neuronDag: dag, neurons: 100, calls: 1, runs: 3, okAt: {}, stAt: T0 - 60 * MIN };
    const kvState = { ...doRest, runs: 7, hashes: {}, links: { "nu.test/binnenland/een": "x1" }, sums: sumsVan("Samenvatting oude Worker (Groq)", T0 - MIN) };
    const h = harnas({ kvStart: { state: JSON.stringify(kvState) } });
    await h.opslag.put("st:rest", JSON.stringify(doRest));
    await h.opslag.put("st:at", String(doRest.stAt));
    h.feed.entries = [{ ...e("een", "Kabinet praat over de begroting van volgend jaar", -20), l: link }];
    await h.run(0);
    assert.equal(JSON.parse(h.kv.m.get("uur")!).items[0].kop, "Samenvatting oude Worker (Groq)");
    assert.equal(JSON.parse(h.opslag.m.get("st:rest") as string).runs, 8);
  });

  await t("normaal bedrijf: twee opeenvolgende runs → de tweede kiest de DO-state (KV wint niet)", async () => {
    const h = harnas();
    h.feed.entries = [e("een", "Kabinet praat over de begroting van volgend jaar", -20)];
    await h.run(0);
    const rest = JSON.parse(h.opslag.m.get("st:rest") as string), kv = JSON.parse(h.kv.m.get("state")!);
    assert.equal(kvStateWint(rest, kv, Number(h.opslag.m.get("st:at"))), false);
    await h.run(5);
    // KV-kopie (< 50 min) is van run 1, DO van run 2
    assert.equal(JSON.parse(h.opslag.m.get("st:rest") as string).runs, 2);
    assert.equal(kvStateWint(JSON.parse(h.opslag.m.get("st:rest") as string), JSON.parse(h.kv.m.get("state")!), Number(h.opslag.m.get("st:at"))), false);
    await h.run(10);
    assert.equal(JSON.parse(h.opslag.m.get("st:rest") as string).runs, 3, "runs loopt door: DO leidend");
    assert.equal(h.opslag.m.get("st:at"), String(T0 + 10 * MIN));
  });

  await t("og-cache: tweede run stuurt geen og-jobs, 0 og-KV-writes; regel ouder dan 3 dagen verloopt", async () => {
    const h = harnas();
    h.feed.entries = [e("een", "Kabinet praat over de begroting van volgend jaar", -20), e("twee", "Brand in havengebied verwoest loods", -15)];
    const r1 = await h.run(0);
    assert.equal(h.ogJobs.length, 2);
    assert.ok(!r1.kvPuts.some((k) => k.startsWith("og:")));
    const uur1 = JSON.parse(h.kv.m.get("uur")!);
    assert.ok(uur1.items.every((i: any) => i.beelden?.length), "foto's komen uit de og-cache");
    const cache: Record<string, [string, number]> = (await h.opslag.get("ogcache")) as any;
    assert.equal(Object.keys(cache).length, 2);
    await h.run(5);
    assert.equal(h.ogJobs.length, 2, "geen nieuwe og-jobs");
    assert.ok(!h.kv.puts.some((k) => k.startsWith("og:")));
    assert.ok(!h.opslag.puts.slice(h.opslag.puts.indexOf("ogcache") + 1).includes("ogcache"), "ogcache niet opnieuw geschreven");
    for (const v of Object.values(cache)) v[1] = T0 - 3 * 86400e3 - 1;
    await h.opslag.put("ogcache", cache);
    await h.run(10);
    assert.equal(h.ogJobs.length, 4, "verlopen regels worden opnieuw opgehaald");
  });

  await t("ig-cache: tweede Fetcher-aanroep gebruikt de DO-cache, geen embed-verzoek en geen KV", async () => {
    const opslag = nepOpslag();
    const f = new Fetcher({ storage: opslag } as any, {} as any);
    // de reel is steeds een uur oud, zodat hij ook na 21 uur nog "van vandaag" is
    const profiel = () => `"contextJSON":${JSON.stringify(JSON.stringify({ context: { graphql_media: [{ shortcode_media: { shortcode: "ABC123", is_video: true, taken_at_timestamp: Math.floor((klok - 60 * MIN) / 1000), edge_media_to_caption: { edges: [{ node: { text: "Een korte reel over het nieuws van vandaag." } }] }, owner: { username: "acct" } } }], username: "acct" } }))}`;
    const embeds: string[] = [];
    globalThis.fetch = (async (u: any) => {
      const url = String(u);
      if (url.includes("/p/ABC123/embed")) { embeds.push(url); return new Response(`video_url":"https://v.test/a.mp4?x=1"`); }
      return new Response(profiel());
    }) as any;
    const vraag = async () => (await (await f.fetch(new Request("https://do/f", { method: "POST", body: JSON.stringify({ jobs: [{ url: "https://www.instagram.com/acct/", kind: "insta", label: "Acct" }], since: T0 - 4 * 3600e3 }) }))).json()) as any[];
    klok = T0;
    const r1 = await vraag();
    assert.equal(r1[0].videos[0].embed, "https://v.test/a.mp4?x=1");
    assert.equal(embeds.length, 1);
    assert.equal(opslag.puts.filter((k) => k === "igcache").length, 1);
    klok = T0 + 19 * 3600e3;
    const r2 = await vraag();
    assert.equal(r2[0].videos[0].embed, "https://v.test/a.mp4?x=1");
    assert.equal(embeds.length, 1, "geen tweede embed-verzoek binnen 20 uur");
    assert.equal(opslag.puts.filter((k) => k === "igcache").length, 1, "geen nieuwe schrijfactie");
    klok = T0 + 21 * 3600e3;
    await vraag();
    assert.equal(embeds.length, 2, "na 20 uur verlopen");
    klok = T0;
  });

  await t("Runner-pad: /info start geen run, onbekend pad is 404 zonder run, /run werkt en respecteert het run-slot", async () => {
    const h = harnas();
    h.feed.entries = [e("een", "Kabinet praat over de begroting van volgend jaar", -20)];
    let runs = 0;
    const echteRun = h.r.run.bind(h.r);
    h.r.run = (async (...a: any[]) => { runs++; return (echteRun as any)(...a); }) as any;
    const info = await h.r.fetch(new Request("https://do/info"));
    assert.equal(info.status, 200);
    assert.deepEqual(await info.json(), { vooraf: null, tellers: [] });
    for (const pad of ["/", "/runner", "/run/extra", "/f", "/INFO"]) assert.equal((await h.r.fetch(new Request(`https://do${pad}`))).status, 404);
    assert.equal(runs, 0);
    assert.equal(h.kv.puts.length, 0);
    assert.equal(h.opslag.puts.length, 0, "ook geen DO-writes door onbekende paden");
    await h.opslag.put("runSlot", klok - MIN);
    assert.equal((await h.r.fetch(new Request("https://do/run"))).status, 409);
    assert.equal(runs, 0);
    h.opslag.m.delete("runSlot");
    assert.equal((await h.r.fetch(new Request("https://do/run"))).status, 200);
    assert.equal(runs, 1);
    assert.equal(h.opslag.m.has("runSlot"), false, "slot weer vrij");
  });

  await t("alarm: ongewijzigde klaar-lijst en data-vooraf = 0 writes; vooraf-log alleen in DO-opslag en via /info en /status", async () => {
    const h = harnas();
    const A10 = 10;
    await h.opslag.put("vooraf", { uur: A10, n: 0 });
    await h.opslag.put("st:rest", JSON.stringify({ datum: "2026-11-02", neuronDag: "2026-11-02", neurons: 0, calls: 0, runs: 1 }));
    h.kv.m.set("uur", JSON.stringify({ gegenereerd: iso(0), datum: "x", items: [], filmpjes: [], dumpert: [], meta: { aiStand: "normaal" } }));
    const film = { titel: "Een filmpje", href: "https://www.dumpert.nl/item/1_abc", embed: "https://media.test/a.mp4", bron: "Dumpert" };
    let samenvattingen = 0;
    globalThis.fetch = (async (u: any) => {
      const url = String(u);
      if (url.includes("/data.json?statisch=1")) return Response.json({ gegenereerd: iso(-240), items: [], filmpjes: [], dumpert: [] });
      if (url.includes("/data.json?vooraf=")) return Response.json({ filmpjes: [], dumpert: [film] });
      if (url.endsWith("/samenvatting")) { samenvattingen++; return Response.json({ ok: true, punten: ["a", "b"], bron: "spraak", sec: 30, neuronen: 5 }); }
      return new Response("nee", { status: 404 });
    }) as any;
    klok = T0;
    await h.r.alarm();
    assert.deepEqual([...h.kv.puts].sort(), ["data-vooraf", "sv-klaar"], "eerste alarm schrijft beide");
    assert.ok(!h.kv.puts.includes("vooraf-log"));
    h.kv.puts.length = 0;
    await h.opslag.put("vooraf", { uur: A10, n: 0 });
    klok = T0 + 5 * MIN;
    await h.r.alarm();
    assert.equal(samenvattingen, 2, "het alarm vraagt de samenvatting opnieuw aan (de Function cachet)");
    assert.deepEqual(h.kv.puts, [], "zelfde klaar-lijst en zelfde etag: 0 writes");
    const info: any = await (await h.r.fetch(new Request("https://do/info"))).json();
    assert.equal(info.vooraf.klaar, 1);
    assert.equal(info.tellers.length, 2);
    assert.deepEqual(info.tellers.map((x: any) => [x.soort, x.kv]), [["alarm", 2], ["alarm", 0]]);
    // /status leest het vooraf-log via de Runner (KV-vooraf-log is niet meer nodig)
    const env: any = { NIEUWS: h.kv, RUNNER: { idFromName: () => "r", get: () => ({ fetch: (u: string) => h.r.fetch(new Request(u)) }) } };
    const status: any = await (await worker.fetch(new Request("https://w/status"), env)).json();
    assert.equal(status.vooraf.klaar, 1);
    assert.equal(status.kvTellers.length, 2);
    // een klaar-lijst die 24 uur of ouder is wordt toch opnieuw geschreven (TTL 2 dagen)
    await h.opslag.put("vooraf", { uur: 10, n: 0 });
    klok = T0 + 24 * 3600e3 + MIN;
    h.kv.m.set("uur", JSON.stringify({ gegenereerd: new Date(klok).toISOString(), datum: "x", items: [], filmpjes: [], dumpert: [], meta: { aiStand: "normaal" } }));
    h.kv.puts.length = 0;
    await h.r.alarm();
    assert.ok(h.kv.puts.includes("sv-klaar") && h.kv.puts.includes("data-vooraf"));
    // wijzigt de klaar-lijst, dan wordt sv-klaar wél geschreven
    await h.opslag.put("vooraf", { uur: 10, n: 0 });
    klok += 5 * MIN;
    h.kv.puts.length = 0;
    const eerder = globalThis.fetch;
    globalThis.fetch = (async (u: any, i?: any) => String(u).endsWith("/samenvatting") ? Response.json({ ok: true, punten: ["anders"], bron: "spraak", sec: 30, neuronen: 5 }) : eerder(u, i)) as any;
    await h.r.alarm();
    assert.ok(h.kv.puts.includes("sv-klaar"));
  });

  await t("Worker /status valt terug op KV vooraf-log als de Runner niet antwoordt", async () => {
    const kv = nepKv();
    kv.m.set("uur", JSON.stringify({ gegenereerd: "g", meta: { model: "m" } }));
    kv.m.set("vooraf-log", JSON.stringify({ klaar: 7 }));
    const env: any = { NIEUWS: kv, RUNNER: { idFromName: () => "r", get: () => ({ fetch: async () => { throw new Error("weg"); } }) } };
    const d: any = await (await worker.fetch(new Request("https://w/status"), env)).json();
    assert.equal(d.vooraf.klaar, 7);
    assert.equal(d.model, "m");
  });
} finally {
  Date.now = echteNow;
  globalThis.fetch = echteFetch;
  console.log = echteLog;
}
console.log(`\n${n} kv-opslag-tests geslaagd`);
