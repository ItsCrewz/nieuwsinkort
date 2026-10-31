import assert from "node:assert/strict";
import { summarize, verdiep, schoonBericht, telAanroepFout, telOutputFout, type Usage } from "../worker/src/ai";
import type { LlmState } from "../worker/src/llm";

// #431: aiFouten gesplitst in aanroep/output, laatste fout, en precies één terugval naar Groq (alleen mocks, geen netwerk)
let n = 0;
const t = async (naam: string, fn: () => Promise<void>) => { await fn(); n++; console.log("✓", naam); };
const dag = new Date().toISOString().slice(0, 10);
const items = [1, 2].map((id) => ({ id, cat: "nl", bronnen: ["Bron"], titels: ["Een titel"], tekst: "GEHEIME artikeltekst" }));
const goed = JSON.stringify({ items: [{ id: 1, kop: "Kop een", ai: "Zin een" }, { id: 2, kop: "Kop twee", ai: "Zin twee" }] });
const usage = (llm?: Partial<NonNullable<Usage["llm"]>>): Usage => ({ neurons: 0, calls: 0, fails: 0, inTok: 0, outTok: 0, ...(llm ? { llm: { state: {}, ...llm } } : {}) });
const cf = (...antwoorden: (string | Error)[]) => {
  const ai = { n: 0, run: async () => { const a = antwoorden[Math.min(ai.n++, antwoorden.length - 1)]; if (a instanceof Error) throw a; return { response: a }; } };
  return ai;
};
const origineel = globalThis.fetch;
let groqCalls: any[] = [];
const groqAntwoord = (...antwoorden: (string | number)[]) => {
  groqCalls = [];
  globalThis.fetch = (async (_url: any, init: any) => {
    groqCalls.push(JSON.parse(init.body));
    const a = antwoorden[Math.min(groqCalls.length - 1, antwoorden.length - 1)];
    return typeof a === "number" ? new Response("", { status: a }) : Response.json({ choices: [{ message: { content: a } }], usage: { prompt_tokens: 100, completion_tokens: 50 } });
  }) as typeof fetch;
};
try {
  await t("aanroep-fout: exception telt als aanroep, met laatste fout", async () => {
    const u = usage();
    await assert.rejects(summarize(cf(new Error("kapot")) as any, "m", items, u), (e) => { telAanroepFout(u, e); return true; });
    assert.deepEqual([u.fails, u.fAanroep, u.fOutput || 0], [1, 1, 0]);
    assert.equal(u.laatsteFout?.soort, "aanroep");
    assert.equal(u.laatsteFout?.bron, "cloudflare");
    assert.match(u.laatsteFout!.bericht, /kapot/);
    assert.ok(!Number.isNaN(Date.parse(u.laatsteFout!.tijd)));
  });
  await t("aanroep-fout: Groq-HTTP-fout na Cloudflare-fout geeft bron groq", async () => {
    groqAntwoord(500);
    const u = usage({ sleutel: "geheim-sleutel", wacht: { totaal: 0 } });
    await assert.rejects(summarize(cf(new Error("kapot")) as any, "m", items, u), (e) => { telAanroepFout(u, e); return true; });
    assert.equal(u.laatsteFout?.bron, "groq");
    assert.equal(u.laatsteFout?.bericht, "AI-aanbieder HTTP 500");
  });
  await t("output-fout: geen geldige JSON en nul bruikbare items", async () => {
    const u = usage();
    assert.equal((await summarize(cf("dit is geen json") as any, "m", items, u)).size, 0);
    assert.deepEqual([u.fails, u.fAanroep || 0, u.fOutput], [1, 0, 1]);
    assert.equal(u.laatsteFout?.soort, "output");
    assert.equal(u.laatsteFout?.bericht, "Geen geldige JSON");
    assert.equal(u.laatsteFout?.bron, "cloudflare");
    assert.equal((await summarize(cf(JSON.stringify({ items: [{ id: 9 }] })) as any, "m", items, u)).size, 0);
    assert.deepEqual([u.fails, u.fOutput], [2, 2]);
    assert.equal(u.laatsteFout?.bericht, "Geen bruikbare items");
    assert.equal(u.terugval || 0, 0, "zonder externe keten geen terugval");
  });
  await t("aiFouten blijft de som van beide soorten", async () => {
    const u = usage();
    telAanroepFout(u, new Error("a")); telOutputFout(u, "b"); telOutputFout(u, "c");
    assert.equal(u.fails, (u.fAanroep || 0) + (u.fOutput || 0));
    assert.deepEqual([u.fAanroep, u.fOutput], [1, 2]);
  });
  await t("schoonBericht: geen URL's, sleutels of lange tokens; max 160 tekens", async () => {
    const s = schoonBericht(new Error("Fout https://api.example/x?key=abc123&q=GEHEIM bij Bearer gsk_abcdefghijklmnopqrstuvwxyz0123456789 en token=zzz\nregel2 " + "x".repeat(400)));
    assert.ok(s.length <= 160);
    assert.doesNotMatch(s, /https?:|key=|GEHEIM|Bearer|gsk_|zzz|\n|xxxxxxxx/);
    assert.equal(schoonBericht(""), "onbekende fout");
    assert.equal(schoonBericht("AI-aanbieder HTTP 429"), "AI-aanbieder HTTP 429");
    assert.equal(schoonBericht("Leeg AI-antwoord"), "Leeg AI-antwoord");
  });
  await t("laatste fout bevat geen prompt- of artikeltekst", async () => {
    const u = usage();
    await summarize(cf("nee") as any, "m", items, u);
    assert.doesNotMatch(JSON.stringify(u.laatsteFout), /GEHEIME|Vat elk bericht|nieuws in het kort/i);
  });
  await t("terugval: onbruikbaar Cloudflare-antwoord gaat één keer naar Groq", async () => {
    groqAntwoord(goed);
    const ai = cf("kapot");
    const u = usage({ sleutel: "k", wacht: { totaal: 0 } });
    const res = await summarize(ai as any, "m", items, u);
    assert.equal(res.size, 2);
    assert.equal(ai.n, 1, "geen extra Cloudflare-aanroep");
    assert.equal(groqCalls.length, 1);
    assert.deepEqual([u.terugval, u.terugvalGroq, u.fails], [1, 1, 0]);
  });
  await t("terugval: ook bij leeg Cloudflare-antwoord (verdiep)", async () => {
    groqAntwoord(JSON.stringify({ items: [{ id: 1, uitleg: ["Een lange alinea met genoeg tekst. ".repeat(10)], perBron: [] }] }));
    const ai = cf("");
    const u = usage({ sleutel: "k", wacht: { totaal: 0 } });
    const res = await verdiep(ai as any, "m", [{ id: 1, kop: "k", kort: "k", bronnen: [{ site: "Bron", tekst: "t" }] }], u);
    assert.equal(res.size, 1);
    assert.deepEqual([ai.n, groqCalls.length, u.terugval, u.terugvalGroq, u.fails], [1, 1, 1, 1, 0]);
  });
  await t("terugval: Groq ook onbruikbaar = één output-fout, geen lus", async () => {
    groqAntwoord("ook kapot");
    const ai = cf("kapot");
    const u = usage({ sleutel: "k", wacht: { totaal: 0 } });
    assert.equal((await summarize(ai as any, "m", items, u)).size, 0);
    assert.equal(ai.n, 1);
    assert.equal(groqCalls.length, 1);
    assert.deepEqual([u.terugval, u.terugvalGroq || 0, u.fails, u.fOutput, u.fAanroep || 0], [1, 0, 1, 1, 0]);
    assert.equal(u.laatsteFout?.bron, "groq");
  });
  await t("terugval: keten faalt zelf = aanroep-fout en de run gaat door", async () => {
    groqAntwoord(500);
    const u = usage({ sleutel: "k", wacht: { totaal: 0 } });
    assert.equal((await summarize(cf("kapot") as any, "m", items, u)).size, 0);
    assert.equal(groqCalls.length, 3, "één keer de bestaande keten (elk Groq-model hooguit één keer), geen tweede ronde");
    assert.deepEqual([u.terugval, u.fails, u.fAanroep, u.fOutput || 0], [1, 1, 1, 0]);
    assert.equal(u.laatsteFout?.bericht, "AI-aanbieder HTTP 500");
  });
  await t("geen terugval als de Groq-limiet op is", async () => {
    groqAntwoord(goed);
    const op: LlmState = {};
    for (const m of ["openai/gpt-oss-120b", "qwen/qwen3.8-27b", "openai/gpt-oss-20b"]) op[`groq:${m}`] = { dag, calls: 5, tokens: 199900, venster: [] };
    const u = usage({ sleutel: "k", state: op, wacht: { totaal: 0 } });
    assert.equal((await summarize(cf("kapot") as any, "m", items, u)).size, 0);
    assert.equal(groqCalls.length, 0);
    assert.deepEqual([u.terugval || 0, u.fails, u.fOutput], [0, 1, 1]);
  });
  await t("geen tweede poging als het antwoord al van Groq kwam", async () => {
    groqAntwoord("kapot");
    const u = usage({ sleutel: "k", groqEerst: true, wacht: { totaal: 0 } });
    assert.equal((await verdiep(cf("x") as any, "m", [{ id: 1, kop: "k", kort: "k", bronnen: [{ site: "Bron", tekst: "t" }] }], u)).size, 0);
    assert.equal(groqCalls.length, 1);
    assert.deepEqual([u.terugval || 0, u.fOutput], [0, 1]);
  });
  await t("/status en run-meta: nieuwe velden komen mee uit uur.meta", async () => {
    const { default: worker } = await import("../worker/src/index");
    const meta = { aiFouten: 3, aiFoutenAanroep: 1, aiFoutenOutput: 2, aiLaatsteFout: { soort: "output", bericht: "Geen geldige JSON", tijd: "2026-10-31T10:00:00.000Z", bron: "cloudflare" }, aiTerugval: 2, aiTerugvalGroq: 1, groqTokensVandaag: 1234 };
    const env: any = { NIEUWS: { get: async (k: string) => k === "uur" ? { gegenereerd: "x", meta } : null } };
    const d: any = await (await worker.fetch(new Request("https://w/status"), env)).json();
    for (const [k, v] of Object.entries(meta)) assert.deepEqual(d[k], v);
  });
} finally { globalThis.fetch = origineel; }
console.log(`${n} tests ok`);
