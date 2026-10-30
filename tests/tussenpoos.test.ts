import assert from "node:assert/strict";
import { groq, keten, mistral, retryAfterMs, MISTRAL_TUSSENPOOS, type Aanbieder, type LlmState } from "../worker/src/llm";

// Fake klok: slaap schuift de tijd op; geen echte wachttijd en geen netwerk.
const klok = (start = Date.UTC(2026, 9, 30, 12)) => {
  const k = { nu: start, slapen: [] as number[], wacht: { totaal: 0, nu: () => k.nu, slaap: async (ms: number) => { k.slapen.push(ms); k.nu += ms; } } };
  return k;
};
const v = { sys: "s", user: "u", maxTokens: 10, json: false };
const ruim = { rpm: 1000, rpd: 1000, tpm: 1e6, tpd: 1e7 };
const ok = { tekst: "ok", inTok: 1, outTok: 1 };
const fout429 = (retryAfter: string | null) => Object.assign(new Error("AI-aanbieder HTTP 429"), { retryAfter });
const origineel = globalThis.fetch, foutlog = console.error;
console.error = () => {};
try {
  // Retry-After: seconden, HTTP-datum, onleesbaar
  assert.equal(retryAfterMs("2", 0), 2000);
  assert.equal(retryAfterMs("0.5", 0), 500);
  assert.equal(retryAfterMs(new Date(3000).toUTCString(), 1000), 2000);
  assert.equal(retryAfterMs(new Date(0).toUTCString(), 1000), 0);
  assert.equal(retryAfterMs("binnenkort", 0), undefined);
  assert.equal(retryAfterMs(null, 0), undefined);

  // Mistral: standaard 1,1 s, instelbaar, ongeldige waarde valt terug
  assert.equal(mistral("x")!.limieten.tussenpoos, MISTRAL_TUSSENPOOS);
  assert.equal(MISTRAL_TUSSENPOOS, 1100);
  assert.equal(mistral("x", undefined, "2000")!.limieten.tussenpoos, 2000);
  assert.equal(mistral("x", undefined, "-1")!.limieten.tussenpoos, 1100);
  assert.equal(groq("x")!.limieten.tussenpoos, undefined);

  // Opeenvolgende verzoeken naar één aanbieder liggen minstens de tussenpoos uit elkaar
  {
    const k = klok(), starts: number[] = [];
    const a: Aanbieder = { naam: "p", modellen: ["m"], limieten: { ...ruim, tussenpoos: 1100 }, call: async () => { starts.push(k.nu); k.nu += 200; return ok; } };
    const state: LlmState = {};
    for (let i = 0; i < 3; i++) assert.equal(await keten([a], state, v, () => {}, k.wacht), "ok");
    assert.deepEqual(starts.map((s) => s - starts[0]), [0, 1100, 2200]);
    assert.deepEqual(k.slapen, [900, 900]);
    assert.equal(k.wacht.totaal, 1800);
  }

  // Gelijktijdige aanroepen delen de state en reserveren elk een eigen slot
  {
    const k = klok(), starts: number[] = [];
    const a: Aanbieder = { naam: "p", modellen: ["m"], limieten: { ...ruim, tussenpoos: 1100 }, call: async () => { starts.push(k.nu); return ok; } };
    const state: LlmState = {};
    const nu0 = k.nu;
    k.wacht.slaap = async (ms: number) => { k.slapen.push(ms); };
    k.wacht.nu = () => nu0;
    await Promise.all([0, 1, 2].map(() => keten([a], state, v, () => {}, k.wacht)));
    assert.deepEqual(k.slapen, [1100, 2200]);
    assert.deepEqual(state["p:m"].venster.map((x) => x.tijd - nu0), [0, 1100, 2200]);
  }

  // De tussenpoos geldt per aanbieder over alle modellen; een andere aanbieder wacht niet
  {
    const k = klok(), log: string[] = [];
    const a: Aanbieder = { naam: "a", modellen: ["m1", "m2"], limieten: { ...ruim, tussenpoos: 1100 }, call: async (m) => { log.push(`a:${m}@${k.nu}`); throw new Error("AI-aanbieder HTTP 500"); } };
    const b: Aanbieder = { naam: "b", modellen: ["n"], limieten: ruim, call: async (m) => { log.push(`b:${m}@${k.nu}`); return ok; } };
    const t0 = k.nu;
    assert.equal(await keten([a, b], {}, v, () => {}, k.wacht), "ok");
    assert.deepEqual(log, [`a:m1@${t0}`, `a:m2@${t0 + 1100}`, `b:n@${t0 + 1100}`]);
  }

  // 429 met Retry-After: eenmaal opnieuw na die tijd (minstens de tussenpoos), daarna volgende aanbieder
  {
    const k = klok(), starts: number[] = [];
    let n = 0;
    const a: Aanbieder = { naam: "p", modellen: ["m"], limieten: { ...ruim, tussenpoos: 1100 }, call: async () => { starts.push(k.nu); if (n++ === 0) throw fout429("2"); return ok; } };
    const state: LlmState = {};
    assert.equal(await keten([a], state, v, () => {}, k.wacht), "ok");
    assert.deepEqual(starts.map((s) => s - starts[0]), [0, 2000]);
    assert.equal(state["p:m"].calls, 2);

    const k2 = klok(); n = 0; starts.length = 0;
    const kort: Aanbieder = { ...a, call: async () => { starts.push(k2.nu); if (n++ === 0) throw fout429("0"); return ok; } };
    assert.equal(await keten([kort], {}, v, () => {}, k2.wacht), "ok");
    assert.deepEqual(starts.map((s) => s - starts[0]), [0, 1100]);
  }

  // Slechts één retry; Retry-After boven 5 s of zonder header en zonder tussenpoos: geen retry
  for (const [retryAfter, tussenpoos, verwacht] of [["1", 1100, 2], ["6", 1100, 1], ["5", 0, 2], [null, 1100, 2], [null, 0, 1], ["onzin", 0, 1]] as const) {
    const k = klok();
    let calls = 0;
    const a: Aanbieder = { naam: "p", modellen: ["m"], limieten: { ...ruim, tussenpoos }, call: async () => { calls++; throw fout429(retryAfter); } };
    await assert.rejects(keten([a], {}, v, () => {}, k.wacht), /uitgeput/);
    assert.equal(calls, verwacht, `retryAfter=${retryAfter} tussenpoos=${tussenpoos}`);
    assert.ok(k.slapen.every((ms) => ms <= 5000));
  }

  // Andere HTTP-fouten worden niet herhaald
  {
    const k = klok();
    let calls = 0;
    const a: Aanbieder = { naam: "p", modellen: ["m"], limieten: { ...ruim, tussenpoos: 1100 }, call: async () => { calls++; throw new Error("AI-aanbieder HTTP 503"); } };
    await assert.rejects(keten([a], {}, v, () => {}, k.wacht));
    assert.equal(calls, 1);
  }

  // Echte Mistral-aanbieder: Retry-After-header uit de response wordt gebruikt
  {
    const k = klok(), starts: number[] = [];
    globalThis.fetch = (async () => {
      starts.push(k.nu);
      return starts.length === 1 ? new Response("", { status: 429, headers: { "Retry-After": "3" } }) : Response.json({ choices: [{ message: { content: "antwoord" } }], usage: { prompt_tokens: 1, completion_tokens: 1 } });
    }) as typeof fetch;
    assert.equal(await keten([mistral("voorbeeld")!], {}, v, () => {}, k.wacht), "antwoord");
    assert.deepEqual(starts.map((s) => s - starts[0]), [0, 3000]);
  }
} finally {
  globalThis.fetch = origineel;
  console.error = foutlog;
}
console.log("tussenpoos-tests geslaagd");
