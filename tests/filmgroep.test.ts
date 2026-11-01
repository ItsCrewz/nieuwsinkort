// #459: Filmpjes in onderwerpgroepen. Fake AI die calls telt, nep-KV die puts telt, nep-DO-opslag, vaste klok, geen netwerk.
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import { Runner } from "../worker/src/index";
import { YT_NIEUWS, ytUrl } from "../worker/src/videos";
import { KANALEN, terugvalGroep, snoeiGroepen, leesOpslag, leesAntwoord, groepSleutel, GROEP_TTL_MS, GROEP_POGINGEN } from "../worker/src/filmgroep";
import { FILM_GROEPEN, groepVan, groepeer, sorteerOpGroep, heeftGroepen } from "../src/filmgroep";

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

type Fx = { titel: string; kanaal: string | null; href: string; korte_tekst: string; groep: string };
const FX: Fx[] = JSON.parse(readFileSync("tests/fixtures/filmgroepen-dryrun.json", "utf8"));
// zonder F1/Haarlem105: die titels worden door het ontdubbelen van de Worker deels samengevoegd of weggelaten
const FXOK = FX.filter((f) => f.kanaal !== "FORMULA 1" && f.kanaal !== "Haarlem105");
const groepVanTitel = new Map(FX.map((f) => [f.titel, f.groep]));

function nepKv() {
  const m = new Map<string, string>(), puts: string[] = [];
  return { m, puts, get: async (k: string, type?: string) => { const v = m.get(k) ?? null; return type === "json" ? (v ? JSON.parse(v) : null) : v; }, put: async (k: string, v: string) => { puts.push(k); m.set(k, v); }, delete: async (k: string) => { m.delete(k); }, list: async () => ({ keys: [] }) };
}
function nepOpslag() {
  const m = new Map<string, unknown>(), puts: string[] = [];
  let alarm: number | null = null;
  return { m, puts, get: async (k: string) => (m.has(k) ? structuredClone(m.get(k)) : undefined), put: async (k: string, v: unknown) => { puts.push(k); m.set(k, structuredClone(v)); }, delete: async (k: string) => { m.delete(k); }, getAlarm: async () => alarm, setAlarm: async (a: number) => { alarm = a; } };
}

const kanaalNaam = (f: Fx) => f.kanaal || "Nieuwsuur";
const video = (f: Fx, i: number) => ({
  titel: f.titel, ai: f.korte_tekst, bron: "YouTube", href: f.href, embed: `https://www.youtube-nocookie.com/embed/${f.href.split("/").pop()}?autoplay=1&rel=0`,
  thumb: `https://i.ytimg.com/vi/${f.href.split("/").pop()}/hqdefault.jpg`, populariteit: "1k views", tijd: "09:00", _score: 1000 - i, _pub: T0 - (i + 5) * MIN, soort: i % 2 ? "journaal" : "short", _kanaal: kanaalNaam(f),
});
const bronnen = { groepen: [] };

/** `AI.run` telt per soort call; de indeling-call antwoordt volgens de fixture, `antwoord` kan dat overschrijven. */
function harnas() {
  const kv = nepKv(), opslag = nepOpslag();
  const aanbod: { fx: Fx[] } = { fx: [] };
  const ai = { alle: [] as any[], groep: [] as any[], antwoord: undefined as undefined | ((items: any[]) => string) };
  const env: any = {
    SITE: "https://lokaal", MODEL: "@cf/google/gemma-4-26b-a4b-it", NIEUWS: kv,
    AI: { run: async (_m: string, args: any) => {
      ai.alle.push(args);
      if (!/onderwerpgroepen/.test(args.messages[0].content)) return { response: '{"items":[]}' };
      const user: string = args.messages[1].content;
      const items = JSON.parse(user.slice(user.indexOf("Filmpjes:\n") + 10));
      ai.groep.push({ args, items });
      if (ai.antwoord) return { response: ai.antwoord(items) };
      return { response: JSON.stringify({ items: items.map((x: any) => ({ id: x.id, groep: groepVanTitel.get(x.titel) })) }), usage: { prompt_tokens: 600, completion_tokens: 60 } };
    } },
    FETCHER: { idFromName: (x: string) => x, get: () => ({ fetch: async (_u: string, init: any) => Response.json(JSON.parse(init.body).jobs.map((j: any) => {
      const naam = Object.entries(YT_NIEUWS).find(([, cid]) => ytUrl(cid) === j.url)?.[0];
      const videos = naam ? aanbod.fx.map((f, i) => [f, i] as const).filter(([f]) => kanaalNaam(f) === naam).map(([f, i]) => video(f, i)) : [];
      return { url: j.url, ok: true, status: 200, ms: 1, entries: [], videos };
    })) }) },
  };
  const ctx: any = { storage: opslag, blockConcurrencyWhile: async (fn: () => Promise<unknown>) => fn() };
  const r = new Runner(ctx, env);
  globalThis.fetch = (async (u: any) => {
    const url = String(u);
    if (url.includes("/bronnen.json")) return Response.json(bronnen);
    if (url.includes("/data.json?statisch=1")) return Response.json({ gegenereerd: new Date(T0 - 240 * MIN).toISOString(), items: [], filmpjes: [], dumpert: [] });
    return new Response("nee", { status: 404 });
  }) as any;
  const run = async (min: number) => {
    klok = T0 + min * MIN;
    const kvVoor = kv.puts.length, groepVoor = ai.groep.length;
    const res = await r.fetch(new Request("https://do/run"));
    return { res, body: (await res.json()) as any, kvPuts: kv.puts.slice(kvVoor), groepCalls: ai.groep.length - groepVoor };
  };
  const uur = () => JSON.parse(kv.m.get("uur") || "{}");
  return { kv, opslag, env, ai, aanbod, run, uur };
}
const groepenUur = (h: ReturnType<typeof harnas>) => Object.fromEntries(h.uur().filmpjes.map((v: any) => [v.titel, v.groep]));

try {
  await t("frontendlogica: vaste volgorde, lege groepen weg, zonder groep = Nieuws, volgorde binnen groep blijft", async () => {
    assert.deepEqual([...FILM_GROEPEN], ["Nieuws", "Politiek", "Showbizz", "Opvallend", "Sport"]);
    const l = [{ id: 1, groep: "Sport" }, { id: 2 }, { id: 3, groep: "Opvallend" }, { id: 4, groep: "Nieuws" }, { id: 5, groep: "Sport" }, { id: 6, groep: "onzin" }, { id: 7, groep: "Showbizz" }];
    assert.deepEqual(groepeer(l).map((g) => g.groep), ["Nieuws", "Showbizz", "Opvallend", "Sport"]);
    assert.deepEqual(sorteerOpGroep(l).map((x) => x.id), [2, 4, 6, 7, 3, 1, 5]);
    assert.equal(groepVan({}), "Nieuws");
    assert.equal(groepVan({ groep: "Politiek" }), "Politiek");
    assert.equal(heeftGroepen([{}, {}]), false);
    assert.equal(heeftGroepen([{}, { groep: "Sport" }]), true);
    assert.deepEqual(sorteerOpGroep([{ id: 1 }, { id: 2 }]).map((x: any) => x.id), [1, 2], "oude data blijft in dezelfde volgorde");
  });

  await t("terugval: sport- en showbizzkanalen vallen goed, onbekend = Nieuws, Politiek-hint", async () => {
    for (const f of FX.filter((f) => f.kanaal && KANALEN[f.kanaal])) {
      if (["ESPN NL", "FORMULA 1", "NOS Sport"].includes(f.kanaal!)) assert.equal(terugvalGroep({ href: f.href, titel: f.titel, _kanaal: f.kanaal! }), "Sport", f.kanaal!);
      if (f.kanaal === "RTL Boulevard") assert.equal(terugvalGroep({ href: f.href, titel: f.titel, _kanaal: f.kanaal }), "Showbizz");
    }
    assert.equal(terugvalGroep({ href: "x", titel: "t", _k: "PowNews" }), "Opvallend");
    assert.equal(terugvalGroep({ href: "x", titel: "t", _kanaal: "Onbekend" }), "Nieuws");
    assert.equal(terugvalGroep({ href: "x", titel: "t" }, "Politiek"), "Politiek");
  });

  await t("antwoord lezen is streng: ongeldige JSON, onbekende groep, dubbele en vreemde ids genegeerd", async () => {
    assert.equal(leesAntwoord("geen json", 3).size, 0);
    assert.equal(leesAntwoord("{kapot", 3).size, 0);
    const m = leesAntwoord('```{"items":[{"id":1,"groep":"Sport"},{"id":2,"groep":"Weer"},{"id":9,"groep":"Sport"},{"id":1,"groep":"Nieuws"},{"id":3}]}```', 3);
    assert.deepEqual([...m], [[1, "Sport"]]);
  });

  await t("opslag snoeien: niet meer in de set of ouder dan 3 dagen eruit; ongeldige opslag = leeg", async () => {
    const o = { g: { a: ["Sport", T0], b: ["Sport", T0], c: ["Nieuws", T0 - GROEP_TTL_MS - 1], d: ["Nieuws", T0 - GROEP_TTL_MS + 1] }, p: { a: 1, e: 1, f: 2 } } as any;
    const s = snoeiGroepen(o, T0, new Set(["a", "c", "d", "e"]));
    assert.deepEqual(Object.keys(s.g).sort(), ["a", "d"]);
    assert.deepEqual(s.p, { e: 1 });
    assert.deepEqual(leesOpslag("kapot"), { g: {}, p: {} });
    assert.deepEqual(leesOpslag({ g: { a: ["Onzin", 1], b: ["Sport", 2] } }).g, { b: ["Sport", 2] });
  });

  await t("run 1: 30 nieuwe filmpjes = precies 1 indelingscall met kanaal en kanaalbeschrijving; run 2: 0 calls en geen KV-write; run 3: 1 call met alleen de 2 nieuwe", async () => {
    const h = harnas();
    h.aanbod.fx = FX;
    const r1 = await h.run(0);
    assert.equal(r1.res.status, 200);
    assert.equal(r1.groepCalls, 1);
    assert.equal(r1.body.filmGroepAi, true);
    const N = h.uur().filmpjes.length;
    assert.equal(r1.body.filmGroepNieuw, N);
    const call = h.ai.groep[0];
    assert.equal(call.items.length, N);
    assert.ok(call.items.some((x: any) => x.kanaal === "ESPN NL" && /sportzender/.test(x.kanaalinfo)));
    assert.ok(call.items.some((x: any) => x.kanaal === "RTL Boulevard" && /showbizz/.test(x.kanaalinfo)));
    assert.match(call.args.messages[1].content, /Politiek: partijen, kabinet, Kamer/);
    const g = groepenUur(h);
    assert.equal(Object.keys(g).length, N);
    for (const f of FX) if (f.titel in g) assert.equal(g[f.titel], f.groep, f.titel);
    assert.ok(N >= 25, "de ontdubbeling laat de meeste van de 30 staan");
    assert.equal(Object.keys((h.opslag.m.get("filmgroep") as any).g).length, N);
    assert.ok(!r1.kvPuts.includes("filmgroep"), "de groepen staan in DO-opslag, niet in KV");

    const r2 = await h.run(5);
    assert.equal(r2.groepCalls, 0);
    assert.equal(r2.body.filmGroepAi, false);
    assert.equal(r2.body.filmGroepNieuw, 0);
    assert.deepEqual(r2.kvPuts, [], "geen extra KV-write");

    const extra: Fx[] = [
      { titel: "Keeper stopt strafschop in slotminuut", kanaal: "Ziggo Sport", href: "https://www.youtube.com/shorts/nieuwAAAAA1", korte_tekst: "", groep: "Sport" },
      { titel: "BN'er trouwt in het geheim", kanaal: "RTL Boulevard", href: "https://www.youtube.com/shorts/nieuwAAAAA2", korte_tekst: "", groep: "Showbizz" },
    ];
    for (const f of extra) groepVanTitel.set(f.titel, f.groep);
    h.aanbod.fx = [...extra, ...FX]; // vooraan: hoogste score, dus binnen de plafonds van de selectie
    const r3 = await h.run(10);
    assert.equal(r3.groepCalls, 1);
    assert.deepEqual(h.ai.groep[1].items.map((x: any) => x.titel).sort(), extra.map((f) => f.titel).sort());
    assert.equal(r3.body.filmGroepNieuw, 2);
    assert.equal(groepenUur(h)["BN'er trouwt in het geheim"], "Showbizz");
  });

  await t("geen budget: 0 calls, terugval getoond maar niet bewaard; volgende run met budget deelt wel in", async () => {
    const h = harnas();
    h.aanbod.fx = FXOK.slice(0, 12);
    h.env.BUDGET = "0";
    const r1 = await h.run(0);
    assert.equal(r1.groepCalls, 0);
    assert.equal(r1.body.filmGroepAi, false);
    assert.equal(h.opslag.m.has("filmgroep"), false);
    const g = groepenUur(h);
    for (const f of FXOK.slice(0, 12)) if (f.kanaal === "ESPN NL") assert.equal(g[f.titel], "Sport");
    for (const f of FXOK.slice(0, 12)) if (f.kanaal === "RTL Boulevard") assert.equal(g[f.titel], "Showbizz");
    h.env.BUDGET = "9000";
    const r2 = await h.run(60);
    assert.equal(r2.groepCalls, 1);
    assert.equal(Object.keys((h.opslag.m.get("filmgroep") as any).g).length, 12);
    const g2 = groepenUur(h);
    for (const f of FXOK.slice(0, 12)) assert.equal(g2[f.titel], f.groep);
  });

  await t("ongeldige AI-JSON of AI-fout: terugval, geen crash, telt als poging; na de backoff probeert een volgende run opnieuw", async () => {
    const h = harnas();
    h.aanbod.fx = FXOK.slice(0, 8);
    h.ai.antwoord = () => "dit is geen json";
    const r1 = await h.run(0);
    assert.equal(r1.res.status, 200);
    assert.equal(r1.body.filmGroepAi, true);
    assert.equal(r1.body.filmGroepNieuw, 0);
    assert.deepEqual(Object.keys((h.opslag.m.get("filmgroep") as any).g), [], "geen groep bewaard");
    assert.equal(Object.keys((h.opslag.m.get("filmgroep") as any).p).length, 8, "wel een poging per filmpje");
    assert.equal(h.uur().filmpjes.length > 0, true);
    for (const v of h.uur().filmpjes) assert.ok((FILM_GROEPEN as readonly string[]).includes(v.groep));
    h.ai.antwoord = () => { throw new Error("AI stuk"); };
    const r2 = await h.run(60);
    assert.equal(r2.res.status, 200);
    assert.deepEqual(Object.keys((h.opslag.m.get("filmgroep") as any).g), []);
    h.ai.antwoord = undefined;
    const r3 = await h.run(120);
    assert.equal(r3.groepCalls, 1);
    assert.equal(Object.keys((h.opslag.m.get("filmgroep") as any).g).length, 8);
  });

  await t("#461 backoff: leeg antwoord en fout tellen als poging; runs om de 5 min wachten 15 en 30 minuten; daarna de terugval bewaard", async () => {
    const h = harnas();
    h.aanbod.fx = FXOK.slice(0, 3);
    const uitgesteld = (r: { body: any }) => r.body.filmGroepUitgesteld;
    h.ai.antwoord = () => '{"items":[]}'; // leeg antwoord
    const r0 = await h.run(0);
    assert.equal(r0.groepCalls, 1);
    assert.equal(uitgesteld(r0), 0);
    assert.deepEqual(Object.values((h.opslag.m.get("filmgroep") as any).p).map((x: any) => x[0]), [1, 1, 1]);
    for (const min of [5, 10, 14]) {
      const r = await h.run(min);
      assert.equal(r.groepCalls, 0, `minuut ${min}: nog in backoff`);
      assert.equal(r.body.filmGroepAi, false);
      assert.equal(uitgesteld(r), 3);
    }
    h.ai.antwoord = () => { throw new Error("time-out"); }; // fout telt ook
    const r15 = await h.run(15);
    assert.equal(r15.groepCalls, 1, "AI.run is aangeroepen en gooit");
    assert.equal(r15.body.filmGroepAi, true);
    assert.deepEqual(Object.values((h.opslag.m.get("filmgroep") as any).p).map((x: any) => x[0]), [2, 2, 2]);
    for (const min of [20, 30, 44]) {
      const r = await h.run(min);
      assert.equal(r.body.filmGroepAi, false, `minuut ${min}: 30 minuten backoff`);
      assert.equal(uitgesteld(r), 3);
    }
    h.ai.antwoord = () => '{"items":[]}';
    const r45 = await h.run(45);
    assert.equal(r45.body.filmGroepAi, true);
    assert.equal(r45.body.filmGroepNieuw, 3, "derde poging: terugval bewaard");
    const o: any = h.opslag.m.get("filmgroep");
    assert.equal(Object.keys(o.g).length, 3);
    assert.deepEqual(o.p, {});
    const r50 = await h.run(50);
    assert.equal(r50.body.filmGroepAi, false);
    assert.equal(uitgesteld(r50), 0);
  });

  await t("#461 backoff: bij uurlijks draaien is de wachttijd altijd verstreken", async () => {
    const h = harnas();
    h.aanbod.fx = FXOK.slice(0, 2);
    h.ai.antwoord = () => '{"items":[]}';
    for (let i = 0; i < GROEP_POGINGEN; i++) assert.equal((await h.run(i * 60)).groepCalls, 1);
    assert.equal(Object.keys((h.opslag.m.get("filmgroep") as any).g).length, 2);
    assert.equal((await h.run(GROEP_POGINGEN * 60)).groepCalls, 0);
  });

  await t("#461 opslag: oude vorm p: Record<string, number> wordt gelezen (backoff verstreken), nieuwe vorm blijft", async () => {
    assert.deepEqual(leesOpslag({ g: {}, p: { a: 2, b: [1, 5], c: "x", d: [1] } }).p, { a: [2, 0], b: [1, 5] });
    const h = harnas();
    h.aanbod.fx = FXOK.slice(0, 2);
    h.opslag.m.set("filmgroep", { g: {}, p: Object.fromEntries(FXOK.slice(0, 2).map((f) => [groepSleutel(f.href), 2])) });
    const r = await h.run(0);
    assert.equal(r.groepCalls, 1, "oude teller: direct opnieuw aan de beurt");
    assert.equal(r.body.filmGroepNieuw, 2);
  });

  await t("onbruikbare groep in een geldig antwoord: na drie pogingen wordt de terugval bewaard (geen eindeloze calls)", async () => {
    const h = harnas();
    h.aanbod.fx = FXOK.slice(0, 3);
    h.ai.antwoord = (items) => JSON.stringify({ items: items.map((x: any) => ({ id: x.id, groep: x.id === 1 ? "Sport" : "Weer" })) });
    for (let i = 0; i < GROEP_POGINGEN; i++) await h.run(i * 60);
    assert.equal(h.ai.groep.length, GROEP_POGINGEN);
    assert.equal(Object.keys((h.opslag.m.get("filmgroep") as any).g).length, 3);
    const r = await h.run(GROEP_POGINGEN * 60);
    assert.equal(r.groepCalls, 0);
  });

  await t("de opgeslagen map wordt gesnoeid: filmpjes die weg zijn verdwijnen uit de opslag", async () => {
    const h = harnas();
    h.aanbod.fx = FXOK.slice(0, 10);
    await h.run(0);
    assert.equal(Object.keys((h.opslag.m.get("filmgroep") as any).g).length, 10);
    h.aanbod.fx = FXOK.slice(0, 4);
    await h.run(60);
    assert.deepEqual(Object.keys((h.opslag.m.get("filmgroep") as any).g).sort(), FXOK.slice(0, 4).map((f) => groepSleutel(f.href)).sort());
  });
} finally {
  Date.now = echteNow;
  globalThis.fetch = echteFetch;
  console.log = echteLog;
}
console.log(`\n${n} filmgroep-tests geslaagd`);
