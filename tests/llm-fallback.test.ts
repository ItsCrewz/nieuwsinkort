// Fallbackketen en foutcodes (#874): nepaanbieders, nepklok en nep-Workers AI; geen netwerk, geen echte AI.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { chat, summarize, type Usage } from "../worker/src/ai";
import { keten, type Aanbieder, type LlmState } from "../worker/src/llm";
import { llmCode, budgetTier, kiesModel } from "../worker/src/llmfout";

let n = 0;
const t = async (naam: string, fn: () => Promise<void> | void) => { logs.length = 0; await fn(); n++; console.log("✓", naam); };
const logs: unknown[][] = [];
const echteFout = console.error, echteFetch = globalThis.fetch;
console.error = (...a: unknown[]) => { logs.push(a); };
const codes = () => logs.filter((l) => l[0] === "LLM-fout").map((l) => l[1]);
const v = { sys: "s", user: "u", maxTokens: 10, json: false };
const limieten = { rpm: 100, rpd: 1000, tpm: 100000, tpd: 1000000 };
// Fake klok: elke aanroep kost `duur` ms.
const klok = (duur = 0) => { const k = { nu: Date.parse("2026-11-12T10:00:00Z"), wacht: { totaal: 0, nu: () => k.nu, slaap: async (ms: number) => { k.nu += ms; } } }; return { k, duur: () => { k.nu += duur; } }; };
const nep = (naam: string, call: Aanbieder["call"]): Aanbieder => ({ naam, modellen: ["m"], limieten, call });
const fout = (naam: string, message: string) => Object.assign(new Error(message), { name: naam });
const goed = (tekst: string) => async () => ({ tekst, inTok: 1, outTok: 1 });
const usage = (llm?: Partial<NonNullable<Usage["llm"]>>): Usage => ({ neurons: 0, calls: 0, fails: 0, inTok: 0, outTok: 0, llm: { state: {} as LlmState, ...llm } });
const ai = (run: () => Promise<unknown>) => ({ run }) as any;

try {
  const gevallen: [string, Error, string][] = [
    ["time-out", fout("TimeoutError", "The operation was aborted due to timeout"), "LLM_TIMEOUT"],
    ["HTTP 500", new Error("AI-aanbieder HTTP 500"), "LLM_HTTP_5XX"],
    ["HTTP 503", new Error("AI-aanbieder HTTP 503"), "LLM_HTTP_5XX"],
    ["HTTP 429", new Error("AI-aanbieder HTTP 429"), "LLM_RATE_LIMIT"],
    ["leeg antwoord", new Error("Leeg AI-antwoord"), "LLM_PARSE"],
    ["HTTP 400", new Error("AI-aanbieder HTTP 400"), "LLM_OVERIG"],
    ["onbekend", new Error("iets anders"), "LLM_OVERIG"],
  ];
  for (const [naam, e, code] of gevallen) await t(`keten: ${naam} → ${code}, tweede aanbieder levert`, async () => {
    const { k, duur } = klok(250);
    const a = nep("eerste", async () => { duur(); throw e; }), b = nep("tweede", goed("ok"));
    assert.equal(await keten([a, b], {}, v, () => {}, k.wacht), "ok");
    assert.deepEqual(codes(), [code]);
    const regel = logs.find((l) => l[0] === "LLM-fout")!;
    assert.deepEqual(regel.slice(2), ["eerste", "m", "250ms"]);
    assert.equal(llmCode(e), code);
  });

  await t("keten: dagbudget op → LLM_BUDGET, keten gooit (extractief volgt)", async () => {
    const { k } = klok();
    const dag = new Date(k.nu).toISOString().slice(0, 10);
    const state: LlmState = { "eerste:m": { dag, calls: 1000, tokens: 0, venster: [] } };
    let calls = 0;
    await assert.rejects(keten([nep("eerste", async () => { calls++; return { tekst: "x", inTok: 1, outTok: 1 }; })], state, v, () => {}, k.wacht), /AI-keten uitgeput/);
    assert.equal(calls, 0);
    assert.deepEqual(codes(), ["LLM_BUDGET"]);
  });

  await t("llmCode: Cloudflare-dagquota en uitgeputte keten zijn LLM_BUDGET", () => {
    assert.equal(llmCode(new Error("4006: you have used up your daily free allocation")), "LLM_BUDGET");
    assert.equal(llmCode(new Error("AI-keten uitgeput")), "LLM_BUDGET");
    assert.equal(llmCode("kapot"), "LLM_OVERIG");
  });

  await t("log bevat geen prompt of sleutel", async () => {
    const { k } = klok();
    const geheim = "GEHEIM-prompt-sleutel";
    await keten([nep("a", async () => { throw new Error(`HTTP 500 ${geheim}`); }), nep("b", goed("ok"))], {}, { ...v, user: geheim }, () => {}, k.wacht);
    assert.ok(!JSON.stringify(logs.filter((l) => l[0] === "LLM-fout")).includes(geheim));
  });

  await t("chat: Cloudflare faalt (500) → Groq levert; metingen kloppen", async () => {
    const u = usage({ sleutel: "test-sleutel" });
    globalThis.fetch = (async () => Response.json({ choices: [{ message: { content: "uit groq" } }] })) as typeof fetch;
    assert.equal(await chat(ai(async () => { throw new Error("HTTP 500"); }), "@cf/x", "s", "u", 10, u), "uit groq");
    assert.equal(u.laatsteBron, "groq");
    assert.deepEqual(codes(), ["LLM_HTTP_5XX"]);
  });

  await t("chat: Cloudflare faalt en externe sleutel ontbreekt → keten uitgeput (extractief)", async () => {
    const u = usage();
    globalThis.fetch = (async () => { throw new Error("netwerk is verboden in deze test"); }) as typeof fetch;
    await assert.rejects(chat(ai(async () => { throw new Error("HTTP 500"); }), "@cf/x", "s", "u", 10, u), /AI-keten uitgeput/);
    assert.deepEqual(codes(), ["LLM_HTTP_5XX", "LLM_BUDGET"]);
  });

  await t("chat: Cloudflare-dagquota → LLM_BUDGET, Cloudflare uit en Groq levert", async () => {
    const u = usage({ sleutel: "test-sleutel" });
    globalThis.fetch = (async () => Response.json({ choices: [{ message: { content: "uit groq" } }] })) as typeof fetch;
    assert.equal(await chat(ai(async () => { throw new Error("4006: daily free allocation used up"); }), "@cf/x", "s", "u", 10, u), "uit groq");
    assert.equal(u.llm!.cloudflare, false);
    assert.deepEqual(codes(), ["LLM_BUDGET"]);
  });

  const items = [{ id: 1, cat: "nl", bronnen: ["NOS"], titels: ["Zwembad dicht"], tekst: "Het zwembad in Haarlem is dicht door een lekkage in het dak." }];
  const goedJson = JSON.stringify({ items: [{ id: 1, kop: "Gemeente sluit zwembad na lekkage in Haarlem", ai: "Het zwembad blijft deze week dicht door een grote lekkage in het dak.", samenvatting: "De gemeente heeft het zwembad gesloten. Er is een lekkage in het dak ontdekt. De reparatie duurt naar verwachting twee weken.", punten: [] }] });

  await t("summarize: kapotte JSON van Cloudflare → LLM_PARSE, één herpoging via Groq levert", async () => {
    const u = usage({ sleutel: "test-sleutel" });
    let fetches = 0, cf = 0;
    globalThis.fetch = (async () => { fetches++; return Response.json({ choices: [{ message: { content: goedJson } }] }); }) as typeof fetch;
    const res = await summarize(ai(async () => { cf++; return { response: "{kapot: json" }; }), "@cf/x", items, u);
    assert.equal(res.size, 1);
    assert.equal(cf, 1); assert.equal(fetches, 1);
    assert.equal(u.terugvalGroq, 1);
    assert.deepEqual(codes(), ["LLM_PARSE"]);
  });

  await t("summarize: kapotte JSON zonder externe sleutel → leeg resultaat (extractief), geen netwerk", async () => {
    const u = usage();
    globalThis.fetch = (async () => { throw new Error("netwerk is verboden in deze test"); }) as typeof fetch;
    const res = await summarize(ai(async () => ({ response: "{kapot: json" })), "@cf/x", items, u);
    assert.equal(res.size, 0);
    assert.equal(u.fails, 1); assert.equal(u.fOutput, 1);
    assert.deepEqual(codes(), ["LLM_PARSE"]);
  });

  await t("summarize: kapotte JSON ook bij Groq → leeg resultaat, geen derde poging", async () => {
    const u = usage({ sleutel: "test-sleutel" });
    let fetches = 0;
    globalThis.fetch = (async () => { fetches++; return Response.json({ choices: [{ message: { content: "ook kapot" } }] }); }) as typeof fetch;
    assert.equal((await summarize(ai(async () => ({ response: "kapot" })), "@cf/x", items, u)).size, 0);
    assert.equal(fetches, 1);
  });

  await t("summarize: leeg Cloudflare-antwoord zonder sleutel → precies één LLM_PARSE-regel", async () => {
    const u = usage();
    globalThis.fetch = (async () => { throw new Error("netwerk is verboden in deze test"); }) as typeof fetch;
    await assert.rejects(summarize(ai(async () => ({ response: "" })), "@cf/x", items, u), /AI-keten uitgeput/);
    assert.deepEqual(codes().filter((c) => c === "LLM_PARSE"), ["LLM_PARSE"]);
  });

  await t("ketenvolgorde: hoofdmodel < 70%, klein model 70–100%, daarna geen AI (trap 4)", () => {
    const B = 9000;
    assert.equal(budgetTier(0, B), 1); assert.equal(budgetTier(0.7 * B - 1, B), 1);
    assert.equal(budgetTier(0.7 * B, B), 2); assert.equal(budgetTier(0.9 * B - 1, B), 2);
    assert.equal(budgetTier(0.9 * B, B), 3); assert.equal(budgetTier(B - 1, B), 3);
    assert.equal(budgetTier(B, B), 4); assert.equal(budgetTier(B * 2, B), 4);
    assert.equal(kiesModel(1, "hoofd", "klein"), "hoofd");
    for (const trap of [2, 3, 4]) assert.equal(kiesModel(trap, "hoofd", "klein"), "klein");
    const src = readFileSync("worker/src/index.ts", "utf8");
    assert.match(src, /budgetTier\(used\(\), BUDGET\)/); assert.match(src, /kiesModel\(tier\(\), model, SMALL\)/);
    assert.match(src, /tier0 === 4 && todo\.length\) logLlmFout\("LLM_BUDGET"/);
  });

  await t("zoekopdracht: AI-aanroepen alleen op de toegestane plekken", () => {
    const bestanden = (map: string): string[] => readdirSync(map, { withFileTypes: true }).flatMap((d) => d.isDirectory() ? bestanden(join(map, d.name)) : d.name.endsWith(".ts") ? [join(map, d.name)] : []);
    const alle = [...bestanden("worker/src"), ...bestanden("functions")];
    const met = (re: RegExp) => alle.filter((f) => re.test(readFileSync(f, "utf8"))).sort();
    // Workers AI-chat: alleen ai.ts (Worker) en samenvatting.ts (Pages, naast Whisper).
    assert.deepEqual(met(/\b(?:ai|AI)\.run\(/), ["functions/samenvatting.ts", "worker/src/ai.ts"]);
    // Groq/Mistral-chat: alleen in llm.ts; samenvatting.ts heeft alleen de Groq-audio-transcriptie.
    assert.deepEqual(met(/api\.(?:groq|mistral)\.(?:ai|com)\/[^"'`]*chat\/completions/), ["worker/src/llm.ts"]);
    assert.deepEqual(met(/api\.(?:groq|mistral)\.(?:ai|com)/), ["functions/samenvatting.ts", "worker/src/llm.ts"]);
    // De andere LLM-gebruikers lopen via chat() uit ai.ts.
    for (const f of ["worker/src/tabsam.ts", "worker/src/filmgroep.ts"]) assert.match(readFileSync(f, "utf8"), /import \{ chat\b[^}]*\} from "\.\/ai"/);
    assert.ok(met(/\bketen\(/).every((f) => ["functions/samenvatting.ts", "worker/src/ai.ts", "worker/src/llm.ts"].includes(f)));
  });
} finally {
  console.error = echteFout;
  globalThis.fetch = echteFetch;
}
console.log(`llm-fallback: ${n} tests geslaagd`);
