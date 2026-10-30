// Meting van het Workers AI-verbruik (#79): echte usage, schatting, mislukte aanroepen, UTC-dag, foutclassificatie, NEURON_FACTOR.
// Alleen lokale doubles: geen netwerk, geen echte AI.
import assert from "node:assert/strict";
import { aiFout, isDagQuota, isTijdelijk, meetChat, meetFout, neuronFactor, nieuwsNeuronen, quotaSleutel, utcDag, zetDagTeller, type Meting } from "../src/budget";
import { chat, summarize, RATES } from "../worker/src/ai";
import { onRequestPost as svPost } from "../functions/samenvatting";
import { videoSlug } from "../src/slug";

let n = 0;
const t = async (naam: string, fn: () => Promise<void> | void) => { await fn(); n++; console.log("✓", naam); };
const nieuw = (): Meting => ({ neurons: 0, calls: 0, fails: 0, inTok: 0, outTok: 0 });
const MODEL = "@cf/google/gemma-4-26b-a4b-it";
const DAG_FOUT = "4006: you have used up your daily free allocation of 10,000 neurons. Please upgrade to Cloudflare's Workers Paid plan";

await t("chat: echte r.usage (tokens en neurons) wordt vastgelegd, niet geschat", async () => {
  const u = nieuw();
  const ai: any = { run: async () => ({ response: "ok", usage: { prompt_tokens: 100, completion_tokens: 20, neurons: 3.5 } }) };
  assert.equal(await chat(ai, MODEL, "sys", "user", 50, u), "ok");
  assert.deepEqual([u.neurons, u.calls, u.inTok, u.outTok, u.geschat || 0], [3.5, 1, 100, 20, 0]);
});
await t("chat: ontbreekt usage, dan schatting uit 3,5 tekens per token en vlag geschat", async () => {
  const u = nieuw();
  const ai: any = { run: async () => ({ response: "x".repeat(70) }) };
  await chat(ai, MODEL, "s".repeat(35), "u".repeat(35), 50, u);
  const [ri, ro] = RATES[MODEL];
  assert.equal(u.inTok, 20); assert.equal(u.outTok, 20);
  assert.ok(Math.abs(u.neurons - (20 * ri + 20 * ro) / 1e6) < 1e-9);
  assert.equal(u.geschat, 1);
});
await t("chat: usage met tokens maar zonder neurons rekent met het tarief en telt als geschat", async () => {
  const u = nieuw();
  await chat({ run: async () => ({ response: "ok", usage: { prompt_tokens: 1000, completion_tokens: 100 } }) } as any, MODEL, "s", "u", 50, u);
  assert.ok(Math.abs(u.neurons - (1000 * RATES[MODEL][0] + 100 * RATES[MODEL][1]) / 1e6) < 1e-9);
  assert.equal(u.geschat, 1);
});
await t("chat: een mislukte aanroep telt mee met een schatting en gooit de fout door", async () => {
  const u = nieuw();
  const ai: any = { run: async () => { throw new Error("InferenceUpstreamError: iets ging mis"); } };
  await assert.rejects(chat(ai, MODEL, "s".repeat(350), "u".repeat(350), 200, u), /iets ging mis/);
  assert.equal(u.calls, 1);
  assert.equal(u.inTok, 200);
  assert.equal(u.outTok, 100, "half max_tokens bij een onbekende fout");
  assert.ok(u.neurons > 0 && u.foutN === u.neurons && u.geschat === 1);
});
await t("chat: een afgewezen aanroep (dagquota of 429) kost alleen invoer", async () => {
  for (const msg of [DAG_FOUT, "429 Too Many Requests"]) {
    const u = nieuw();
    await assert.rejects(chat({ run: async () => { throw new Error(msg); } } as any, MODEL, "s".repeat(350), "u".repeat(350), 200, u));
    assert.equal(u.outTok, 0); assert.equal(u.inTok, 200);
  }
});
await t("summarize: mislukte AI-aanroep telt in usage en gooit door naar de aanroeper", async () => {
  const u = nieuw();
  await assert.rejects(summarize({ run: async () => { throw new Error("timeout"); } } as any, MODEL, [{ id: 1, cat: "nl", bronnen: ["NOS"], titels: ["t"], tekst: "tekst" }], u));
  assert.ok(u.neurons > 0 && u.calls === 1);
});
await t("meetChat/meetFout tellen op over meerdere aanroepen", () => {
  const u = nieuw();
  meetChat(u, [1000, 1000], "p".repeat(35), "u".repeat(35), { prompt_tokens: 10, completion_tokens: 5, neurons: 2 });
  meetChat(u, [1000, 1000], "p".repeat(35), "u".repeat(35), undefined);
  meetFout(u, [1000, 1000], "p".repeat(35), 20, new Error("boem"));
  assert.deepEqual([u.inTok, u.outTok, u.geschat, u.calls], [30, 25, 2, 1]);
  assert.ok(Math.abs(u.neurons - 2.04) < 1e-9 && Math.abs(u.foutN! - 0.02) < 1e-9);
});

await t("foutclassificatie: alleen een echte dagquota-fout is dagquota", () => {
  for (const m of [DAG_FOUT, "AiError: 4006: daily free allocation exceeded", "You have exceeded your daily neurons quota"]) {
    assert.equal(isDagQuota(new Error(m)), true, m);
    assert.equal(aiFout(new Error(m)), "dagquota");
  }
  for (const m of ["429 Too Many Requests", "rate limit exceeded", "Capacity temporarily exceeded, please retry", "3040: Capacity temporarily exceeded", "Request timed out"]) {
    assert.equal(isDagQuota(new Error(m)), false, m);
    assert.equal(isTijdelijk(new Error(m)), true, m);
    assert.equal(aiFout(new Error(m)), "tijdelijk");
  }
  assert.equal(aiFout(new Error("InferenceUpstreamError")), "overig");
  assert.equal(aiFout("4006 daily free allocation"), "dagquota", "ook een string");
  assert.equal(aiFout(undefined), "overig");
});

await t("UTC-dag: ná 00:00 UTC (02:00 Amsterdam) een nieuwe dag, daarvoor nog de oude", () => {
  assert.equal(utcDag(Date.parse("2026-10-30T23:59:00Z")), "2026-10-30");
  assert.equal(utcDag(Date.parse("2026-10-31T00:00:00Z")), "2026-10-31");
  // 01:30 Amsterdam (CET) op 31-10 is nog 30-10 UTC; Amsterdam-datum zou al 31-10 zijn
  assert.equal(utcDag(Date.parse("2026-10-31T00:30:00+02:00")), "2026-10-30");
  assert.equal(utcDag(Date.parse("2026-10-31T01:30:00+01:00")), "2026-10-31");
});
await t("dagteller van de state: loopt door over de Amsterdamse datumgrens, reset op UTC", () => {
  const st = { datum: "2026-10-31", neuronDag: "2026-10-30", neurons: 4200, calls: 9 };
  assert.equal(nieuwsNeuronen(st, "2026-10-30"), 4200, "Amsterdamse datum is al 31-10, de UTC-dag nog 30-10");
  assert.equal(nieuwsNeuronen(st, "2026-10-31"), 0);
  assert.equal(nieuwsNeuronen({ datum: "2026-10-30", neurons: 100, calls: 1 }, "2026-10-30"), 100, "oude state zonder neuronDag");
  assert.equal(nieuwsNeuronen(null, "2026-10-30"), 0);
  zetDagTeller(st, "2026-10-30");
  assert.equal(st.neurons, 4200);
  zetDagTeller(st, "2026-10-31");
  assert.deepEqual([st.neurons, st.calls, st.neuronDag], [0, 0, "2026-10-31"]);
  assert.equal(quotaSleutel("2026-10-30"), "ai-quota:2026-10-30");
});
await t("NEURON_FACTOR: standaard 1, ongeldig valt terug op 1, begrensd tussen 0,5 en 5", () => {
  assert.equal(neuronFactor(undefined), 1);
  assert.equal(neuronFactor(""), 1);
  assert.equal(neuronFactor("abc"), 1);
  assert.equal(neuronFactor("-2"), 1);
  assert.equal(neuronFactor("1.25"), 1.25);
  assert.equal(neuronFactor("100"), 5);
  assert.equal(neuronFactor("0.1"), 0.5);
  assert.equal(9000 / neuronFactor("1.5"), 6000, "effectief budget = BUDGET / factor");
});

// ---- /samenvatting: fouten van Workers AI (mock-KV, mock-AI, geen netwerk)
function sv(aiFoutMsg: string, extra: Record<string, string> = {}) {
  const m = new Map<string, string>(Object.entries(extra));
  const video = { titel: "Testfilmpje", href: "https://x.com/a/status/1", embed: "https://video.twimg.com/a.mp4", bron: "X" };
  m.set("uur", JSON.stringify({ filmpjes: [video], dumpert: [] }));
  const NIEUWS = {
    get: async (k: string, ty?: string) => { const v = m.get(k); return v == null ? null : ty === "json" ? JSON.parse(v) : v; },
    put: async (k: string, v: string) => { m.set(k, v); },
    delete: async (k: string) => { m.delete(k); },
  };
  let aiCalls = 0;
  const env: any = { NIEUWS, ASSETS: { fetch: async () => new Response("{}") }, AI: { run: async () => { aiCalls++; throw new Error(aiFoutMsg); } } };
  const post = () => svPost({ request: new Request("https://nieuwsinkort.test/samenvatting", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: videoSlug(video as any) }) }), env });
  return { m, post, calls: () => aiCalls };
}
const echteFetch = globalThis.fetch;
globalThis.fetch = (async () => new Response(new Uint8Array(2e6), { status: 200 })) as any;
try {
  await t("samenvatting: echte dagquota-fout zet de KV-vlag ai-quota en geeft de budgetmelding", async () => {
    const a = sv(DAG_FOUT);
    const j: any = await (await a.post()).json();
    assert.equal(j.code, "budget");
    assert.equal(a.m.get(quotaSleutel(utcDag())), "1");
    assert.ok(![...a.m.keys()].some((k) => k.startsWith("vs:")), "budgetfout niet gecachet");
  });
  await t("samenvatting: tijdelijke 429 zet de vlag niet, geeft 503 en wordt niet gecachet", async () => {
    const a = sv("429 Too Many Requests: rate limit");
    const r = await a.post();
    assert.equal(r.status, 503);
    assert.equal(((await r.json()) as any).code, "fout");
    assert.equal(a.m.has(quotaSleutel(utcDag())), false);
    assert.ok(![...a.m.keys()].some((k) => k.startsWith("vs:")));
  });
  await t("samenvatting: bekende dagquota-vlag stopt vóór elke AI-aanroep", async () => {
    const a = sv("nooit", { [quotaSleutel(utcDag())]: "1" });
    assert.equal(((await (await a.post()).json()) as any).code, "budget");
    assert.equal(a.calls(), 0);
  });
  await t("samenvatting: vid-neurons-sleutel volgt de UTC-dag, niet de Amsterdamse", async () => {
    const a = sv("InferenceUpstreamError");
    await a.post();
    const sleutels = [...a.m.keys()].filter((k) => k.startsWith("vid-neurons:"));
    assert.ok(sleutels.length > 0 && sleutels.every((k) => k === `vid-neurons:${utcDag()}`), sleutels.join());
  });
} finally { globalThis.fetch = echteFetch; }

console.log(`${n} tests ok`);
