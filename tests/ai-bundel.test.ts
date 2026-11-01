// #453: AI gebundeld en "In het kort" hooguit 1x per 30 min. Emulatie van meerdere runs met vaste klok, nep-KV/-opslag en een nep-AI die aanroepen telt.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import { Runner } from "../worker/src/index";
import { BATCH, bijwerkGezien, bundelBeslis, kortToegestaan } from "../worker/src/bundel";

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

// Titels met elk eigen woorden, zodat de clusterstap ze niet samenvoegt.
const ONDERWERPEN = ["Brand verwoest oude scheepswerf Rotterdam", "Wetenschappers ontdekken zeldzame vlindersoort Veluwe", "Gemeenteraad Zwolle stemt tegen nieuwe parkeergarage", "Rechtbank veroordeelt sjoemelende aannemer Eindhoven", "Marathon Amsterdam trekt recordaantal lopers", "Boeren protesteren tegen stikstofplannen Brabant", "Storm trekt over Waddeneilanden veerdienst gestaakt", "Onderzoek toont toename eenzaamheid onder studenten", "Nieuwe tramlijn Utrecht opent volgende maand", "Museum Groningen krijgt schilderij terug na decennia", "Politie rolt cybercriminelen netwerk op Limburg", "Vakbond FNV dreigt met acties bij supermarkten", "Slimme thermostaat bespaart gemiddeld gas huishoudens", "Ziekenhuis Maastricht start proef met robotchirurgie"];

function harnas(opties: { budget?: string; vidNeuronen?: number; aiUsage?: Record<string, number> } = {}) {
  const km = new Map<string, string>(), opslag = new Map<string, unknown>();
  const calls = { samen: 0, kort: 0, tab: 0, samenBatches: [] as number[] };
  if (opties.vidNeuronen) km.set("vid-neurons:2026-11-02", String(opties.vidNeuronen));
  const kv: any = { get: async (k: string, tp?: string) => { const v = km.get(k) ?? null; return tp === "json" ? (v ? JSON.parse(v) : null) : v; }, put: async (k: string, v: string) => { km.set(k, v); }, delete: async (k: string) => { km.delete(k); } };
  const store: any = { get: async (k: string) => (opslag.has(k) ? structuredClone(opslag.get(k)) : undefined), put: async (k: string, v: unknown) => { opslag.set(k, structuredClone(v)); }, delete: async (k: string) => { opslag.delete(k); }, getAlarm: async () => null, setAlarm: async () => {} };
  const ai = { run: async (_m: string, inv: any) => {
    const user: string = inv.messages[1].content;
    const usage = opties.aiUsage ? { usage: opties.aiUsage } : {};
    if (user.includes("Vat elk bericht samen")) {
      calls.samen++;
      const items = JSON.parse(user.slice(user.indexOf("Berichten:\n") + 11));
      calls.samenBatches.push(items.length);
      return { response: JSON.stringify({ items: items.map((i: any) => ({ id: i.id, kop: `AI-kop ${i.titel}`, ai: `AI-uitleg: de bron meldt dat ${i.titel} vandaag gebeurde en bevestigd is.`, samenvatting: `AI-tekst ${i.titel}.`, punten: [] })) }), ...usage };
    }
    if (user.includes("In het kort")) { calls.kort++; return { response: "Dit is een samenvatting van het nieuws van vandaag met genoeg tekens erin.", ...usage }; }
    calls.tab++;
    return { response: "Dit is een overzicht van de berichten in deze rubriek van vandaag.", ...usage };
  } };
  const feed: { entries: any[] } = { entries: [] };
  const env: any = {
    SITE: "https://lokaal", MODEL: "m", NIEUWS: kv, AI: ai, ...(opties.budget ? { BUDGET: opties.budget } : {}),
    FETCHER: { idFromName: (x: string) => x, get: () => ({ fetch: async (_u: string, init: any) => Response.json(JSON.parse(init.body).jobs.map((j: any) =>
      j.url === "https://nu.test/rss" ? { url: j.url, ok: true, status: 200, ms: 1, entries: feed.entries, videos: [] } : { url: j.url, ok: true, status: 200, ms: 1, text: "", json: [], entries: [], videos: [] })) }) },
  };
  const r = new Runner({ storage: store, blockConcurrencyWhile: async (fn: () => Promise<unknown>) => fn() } as any, env);
  globalThis.fetch = (async (u: any) => {
    const url = String(u);
    if (url.includes("/bronnen.json")) return Response.json({ groepen: [{ id: "nl", bronnen: [{ id: "nu", naam: "NU.nl", feeds: [{ url: "https://nu.test/rss" }] }] }] });
    if (url.includes("/data.json?statisch=1")) return Response.json({ gegenereerd: new Date(T0 - 240 * MIN).toISOString(), items: [], filmpjes: [], dumpert: [] });
    return new Response("nee", { status: 404 });
  }) as any;
  const nieuw = (i: number, min: number) => ({ t: ONDERWERPEN[i], l: `https://nu.test/binnenland/${i}`, s: `Uitleg bij ${ONDERWERPEN[i]}.`, d: T0 + min * MIN });
  const run = async (min: number, force = false) => {
    klok = T0 + min * MIN;
    const res = await r.fetch(new Request(`https://do/run${force ? "?force=1" : ""}`));
    assert.equal(res.status, 200);
    const body: any = await res.json();
    const uur = JSON.parse(km.get("uur") || "{}");
    return { body, uur, ruw: (uur.items || []).filter((i: any) => i.ruw).length, ai: (uur.items || []).filter((i: any) => !i.ruw).length, st: JSON.parse((opslag.get("st:rest") as string) || "{}") };
  };
  return { feed, calls, run, nieuw, km, opslag, r };
}
/** Zet de gemeten runinterval op 5 minuten: twee lege runs vooraf. */
async function opwarmen(h: ReturnType<typeof harnas>) { await h.run(-10); await h.run(-5); }

try {
  await t("bundelBeslis: wacht tot batch, 10-minutengrens of force; interval 60 direct", async () => {
    const g: Record<string, number> = {};
    bijwerkGezien(g, ["a", "b"], 1000);
    assert.deepEqual(g, { a: 1000, b: 1000 });
    bijwerkGezien(g, ["b", "c"], 2000);
    assert.deepEqual(g, { b: 1000, c: 2000 }, "a weg (heeft samenvatting), b houdt zijn eerste tijd");
    assert.deepEqual(bundelBeslis(g, [], 5000, 5, false), { wachtend: 0, uitgesteld: false });
    assert.equal(bundelBeslis({ a: 0 }, ["a"], 0, 5, false).uitgesteld, true);
    assert.equal(bundelBeslis({ a: 0 }, ["a"], 5 * MIN, 5, false).uitgesteld, true, "5+5 = 10 min is niet langer dan 10");
    assert.equal(bundelBeslis({ a: 0 }, ["a"], 10 * MIN, 5, false).uitgesteld, false);
    assert.equal(bundelBeslis({ a: 0 }, ["a"], 0, 60, false).uitgesteld, false, "interval 60: altijd direct");
    assert.equal(bundelBeslis({ a: 0 }, ["a"], 0, 5, true).uitgesteld, false, "force");
    const vijf = Array.from({ length: BATCH }, (_, i) => `k${i}`);
    assert.equal(bundelBeslis({}, vijf, 0, 5, false).uitgesteld, false, "volle batch");
    assert.equal(bundelBeslis({}, vijf.slice(1), 0, 5, false).uitgesteld, true);
    assert.equal(kortToegestaan(undefined, T0, false), true);
    assert.equal(kortToegestaan(1000, 1000 + 29 * MIN, false), false);
    assert.equal(kortToegestaan(1000, 1000 + 30 * MIN, false), true);
    assert.equal(kortToegestaan(1000, 1001, true), true);
  });

  await t("uurlijks (interval 60): elke run direct AI voor het nieuwe cluster, 'In het kort' bij elke wijziging, niets wacht", async () => {
    const h = harnas();
    h.feed.entries = [h.nieuw(0, -20)];
    const r1 = await h.run(0);
    assert.equal(r1.body.runInterval, 60);
    assert.equal(h.calls.samen, 1);
    assert.equal(r1.ai, 1); assert.equal(r1.ruw, 0);
    assert.equal(r1.body.aiGebundeld, false); assert.equal(r1.body.aiWachtend, 0);
    assert.equal(h.calls.kort, 1);
    assert.equal(r1.uur.items[0].kop, `AI-kop ${ONDERWERPEN[0]}`);
    h.feed.entries = [h.nieuw(0, -20), h.nieuw(1, 50)];
    const r2 = await h.run(60);
    assert.equal(r2.body.runInterval, 60);
    assert.equal(h.calls.samen, 2, "alleen het nieuwe cluster krijgt AI (het eerste is bewaard)");
    assert.deepEqual(h.calls.samenBatches, [1, 1]);
    assert.equal(r2.ai, 2); assert.equal(r2.ruw, 0);
    assert.equal(h.calls.kort, 2, "In het kort bij elke run met wijziging");
    // derde run zonder wijziging: geen enkele AI-aanroep
    const voor = { ...h.calls };
    await h.run(120);
    assert.equal(h.calls.samen, voor.samen); assert.equal(h.calls.kort, voor.kort);
  });

  await t("*/5: één nieuw cluster wacht (ruwe terugval), krijgt uiterlijk na 10 minuten AI-tekst", async () => {
    const h = harnas(); await opwarmen(h);
    h.feed.entries = [h.nieuw(0, -3)];
    const r1 = await h.run(0);
    assert.equal(r1.body.runInterval, 5);
    assert.equal(r1.body.aiGebundeld, true); assert.equal(r1.body.aiWachtend, 1);
    assert.equal(h.calls.samen, 0);
    assert.equal(r1.ruw, 1, "zelfde terugval als een run zonder AI: feedtekst met ruw");
    const r2 = await h.run(5);
    assert.equal(r2.body.aiGebundeld, true); assert.equal(h.calls.samen, 0);
    const r3 = await h.run(10);
    assert.equal(r3.body.aiGebundeld, false); assert.equal(r3.body.aiWachtend, 0);
    assert.equal(h.calls.samen, 1);
    assert.equal(r3.ai, 1); assert.equal(r3.ruw, 0);
    assert.deepEqual(r3.st.aiGezien, {}, "eerst-gezien-lijst is leeg zodra er een samenvatting is");
  });

  await t("*/5: een volle batch (>= 5 nieuwe clusters) gaat direct, in één aanroep", async () => {
    const h = harnas(); await opwarmen(h);
    h.feed.entries = [0, 1, 2, 3, 4].map((i) => h.nieuw(i, -3));
    const r = await h.run(0);
    assert.equal(r.body.aiGebundeld, false);
    assert.equal(h.calls.samen, 1); assert.deepEqual(h.calls.samenBatches, [5]);
    assert.equal(r.ai, 5);
    // vier clusters wachten nog
    const h2 = harnas(); await opwarmen(h2);
    h2.feed.entries = [0, 1, 2, 3].map((i) => h2.nieuw(i, -3));
    const r2 = await h2.run(0);
    assert.equal(r2.body.aiGebundeld, true); assert.equal(r2.body.aiWachtend, 4); assert.equal(h2.calls.samen, 0);
  });

  await t("*/5: elk uur een nieuw bericht per run: minder AI-calls dan zonder bundeling, geen cluster > 20 min zonder AI (10 bundelen + 10 publicatie), 'In het kort' ≤ 2x", async () => {
    const h = harnas(); await opwarmen(h);
    const eerst = new Map<number, number>(), klaar = new Map<number, number>();
    let ruwMax = 0;
    const entries: any[] = [];
    for (let i = 0; i < 12; i++) {
      const min = i * 5;
      entries.push(h.nieuw(i, min - 2));
      h.feed.entries = [...entries];
      eerst.set(i, min);
      const r = await h.run(min);
      for (const it of r.uur.items) {
        const idx = ONDERWERPEN.findIndex((o) => it.bronnen[0].href.endsWith(`/${ONDERWERPEN.indexOf(o)}`));
        if (!it.ruw && !klaar.has(idx)) klaar.set(idx, min);
      }
      ruwMax = Math.max(ruwMax, r.ruw);
    }
    for (let i = 0; i < 12; i++) {
      if (i >= 9) continue; // de laatste runs: nog binnen de wachttijd en de publicatietussenpoos
      assert.ok(klaar.has(i), `cluster ${i} heeft AI-tekst gekregen`);
      // 10 minuten bundelen + hooguit 10 minuten tot de volgende toegestane KV-publicatie (#466)
      assert.ok(klaar.get(i)! - eerst.get(i)! <= 20, `cluster ${i}: ${klaar.get(i)! - eerst.get(i)!} min zonder AI-tekst`);
    }
    assert.ok(h.calls.samen <= 6, `samenvatten ${h.calls.samen}x voor 12 nieuwe clusters (zonder bundeling 12x)`);
    assert.ok(h.calls.samen < 12);
    assert.ok(h.calls.kort >= 1 && h.calls.kort <= 2, `In het kort ${h.calls.kort}x in een uur`);
    assert.ok(ruwMax <= 3);
  });

  await t("force negeert de bundeling en de 30-minutenregel van 'In het kort'", async () => {
    const h = harnas(); await opwarmen(h);
    h.feed.entries = [h.nieuw(0, -3)];
    await h.run(0); await h.run(5);
    const r3 = await h.run(10);
    assert.equal(h.calls.samen, 1); assert.equal(h.calls.kort, 1); assert.equal(r3.ruw, 0);
    // 20 min later: nieuw cluster + force → direct AI en direct een nieuwe 'In het kort' (10 min na de vorige)
    h.feed.entries = [h.nieuw(0, -3), h.nieuw(1, 18)];
    const rf = await h.run(20, true);
    assert.equal(rf.body.aiGebundeld, false);
    assert.equal(h.calls.samen, 2, "force: niet wachten");
    assert.equal(h.calls.kort, 2, "force: 30-minutenregel niet van toepassing");
    // zonder force had dezelfde situatie gewacht
    const g = harnas(); await opwarmen(g);
    g.feed.entries = [g.nieuw(0, -3)];
    await g.run(0); await g.run(5); await g.run(10);
    g.feed.entries = [g.nieuw(0, -3), g.nieuw(1, 13)];
    const rg = await g.run(15);
    assert.equal(rg.body.aiGebundeld, true); assert.equal(g.calls.samen, 1); assert.equal(g.calls.kort, 1);
  });

  await t("bundeling omzeilt het run-budget (#451) niet: na de eerste groep stopt de run", async () => {
    // 10 clusters = 2 groepen; de eerste verbruikt (via gemelde tokens) meer dan het run-budget, de tweede wordt overgeslagen
    const h = harnas({ aiUsage: { prompt_tokens: 100000, completion_tokens: 100000 } }); await opwarmen(h);
    h.feed.entries = Array.from({ length: 10 }, (_, i) => h.nieuw(i, -3));
    const r = await h.run(0);
    assert.equal(r.body.aiGebundeld, false);
    assert.equal(h.calls.samen, 1, "tweede groep valt onder het run-budget");
    assert.equal(r.body.runVol, true);
    assert.ok(r.ruw >= 5);
  });

  await t("bundeling omzeilt de dagbudgetgrenzen niet: boven het dagbudget geen AI, ook niet bij een volle batch of force", async () => {
    const h = harnas({ budget: "1000", vidNeuronen: 1000 }); await opwarmen(h);
    h.feed.entries = [0, 1, 2, 3, 4, 5].map((i) => h.nieuw(i, -3));
    const r = await h.run(0);
    assert.equal(h.calls.samen, 0); assert.equal(h.calls.kort, 0);
    assert.equal(r.body.quotaOp, true);
    const rf = await h.run(20, true);
    assert.equal(h.calls.samen, 0); assert.equal(rf.body.quotaOp, true);
  });

  await t("85%-grens voor video's vooraf en PRE_MAX zijn niet gewijzigd", async () => {
    assert.match(readFileSync("worker/src/index.ts", "utf8"), /const vrij = 0\.85 \* BUDGET - used - Math\.max\(0, 23 - A\.h\) \* 260;/);
    assert.match(readFileSync("functions/samenvatting.ts", "utf8"), /const PRE_MAX = 0\.85, PRE_MARGE = 600;/);
  });
} finally {
  Date.now = echteNow; globalThis.fetch = echteFetch; console.log = echteLog;
}
echteLog(`\n${n} ai-bundel-tests geslaagd`);
