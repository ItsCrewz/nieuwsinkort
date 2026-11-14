// Timeout, begrensde retry en foutclassificatie van productie-LLM-aanroepen (#873). Alleen mocks: geen echte klok, netwerk of AI.
import assert from "node:assert/strict";
import { classificeer, llmTimeoutMs, LlmTimeout, metRetry, metTimeout, LLM_TIMEOUT_STANDAARD, WHISPER_TIMEOUT, type Timer } from "../src/llm-aanroep";
import { chat, RATES } from "../worker/src/ai";
import { chat as pagesChat } from "../functions/samenvatting";
import type { Meting } from "../src/budget";

let n = 0;
const t = async (naam: string, fn: () => Promise<void> | void) => { await fn(); n++; console.log("✓", naam); };
const MODEL = "@cf/google/gemma-4-26b-a4b-it";
const nieuw = (): Meting => ({ neurons: 0, calls: 0, fails: 0, inTok: 0, outTok: 0 });
const DAG = "4006: you have used up your daily free allocation of 10,000 neurons";
// Handmatige timer: de test bepaalt wanneer hij afgaat.
const handmatig = () => {
  const taken: (() => void)[] = [];
  const timer: Timer = { zet: (f) => { taken.push(f); return taken.length - 1; }, wis: () => {} };
  return { timer, vuur: () => taken.shift()?.() };
};
const optie = (extra: object = {}) => { const log: string[] = [], slaap: number[] = []; let klok = 0;
  return { log, slaap, o: { model: MODEL, timeoutMs: 50, log: (r: string) => log.push(r), slaap: async (ms: number) => { slaap.push(ms); }, nu: () => (klok += 7), ...extra } }; };

await t("llmTimeoutMs: env gebruiken, ongeldig of te klein valt terug, bovengrens 120 s", () => {
  assert.equal(llmTimeoutMs(undefined), LLM_TIMEOUT_STANDAARD);
  assert.equal(llmTimeoutMs("abc"), LLM_TIMEOUT_STANDAARD);
  assert.equal(llmTimeoutMs("0"), LLM_TIMEOUT_STANDAARD);
  assert.equal(llmTimeoutMs("20000"), 20000);
  assert.equal(llmTimeoutMs("999999"), 120e3);
});
await t("classificeer: realistische Workers AI-fouten", () => {
  assert.equal(classificeer(new Error(DAG)), "dagquota");
  assert.equal(classificeer(new Error("3040: Capacity temporarily exceeded, please try again.")), "429");
  assert.equal(classificeer(new Error("3043: Internal server error")), "5xx");
  assert.equal(classificeer(Object.assign(new Error("boem"), { status: 503 })), "5xx");
  assert.equal(classificeer(Object.assign(new Error("boem"), { status: 429 })), "429");
  assert.equal(classificeer(new Error("HTTP 502 bad gateway")), "5xx");
  assert.equal(classificeer(new LlmTimeout(50)), "timeout");
  assert.equal(classificeer(Object.assign(new Error("x"), { name: "TimeoutError" })), "timeout");
});
await t("classificeer: losse getallen in tekst zijn geen HTTP-status", () => {
  assert.equal(classificeer(new Error("Prompt te lang: 503 tokens, max 429 per bericht")), "overig");
  assert.equal(classificeer(new Error("Ongeldige JSON op positie 500")), "overig");
  assert.equal(classificeer(new Error("model gaf 4006 woorden")), "overig");
});
await t("metTimeout: geeft het resultaat, of LlmTimeout als de timer eerst afgaat", async () => {
  const a = handmatig();
  assert.equal(await metTimeout(async () => "ok", 10, a.timer), "ok");
  const b = handmatig();
  const p = metTimeout(() => new Promise<string>(() => {}), 10, b.timer);
  b.vuur();
  await assert.rejects(p, (e) => e instanceof LlmTimeout);
});
await t("metRetry: 5xx daarna succes = één retry met backoff", async () => {
  const { o, log, slaap } = optie({ backoffMs: 123 });
  let k = 0;
  const r = await metRetry(async () => { if (++k === 1) throw Object.assign(new Error("x"), { status: 500 }); return "ok"; }, o);
  assert.deepEqual([r, k, slaap], ["ok", 2, [123]]);
  assert.equal(log.length, 1);
  assert.match(log[0], /^llm: 5xx model=@cf\/google\/gemma-4-26b-a4b-it duur=\d+ms poging=1$/);
});
await t("metRetry: nooit meer dan één retry, ook niet bij blijvende 5xx", async () => {
  const { o, slaap } = optie();
  let k = 0, fouten = 0;
  await assert.rejects(metRetry(async () => { k++; throw new Error("3043: Internal server error"); }, { ...o, onFout: () => fouten++ }));
  assert.deepEqual([k, fouten, slaap.length], [2, 2, 1]);
});
await t("metRetry: timeout wordt één keer opnieuw geprobeerd", async () => {
  const h = handmatig();
  const { o, slaap } = optie({ timer: h.timer, magRetry: () => true });
  let k = 0;
  const p = metRetry(() => { k++; return k === 1 ? new Promise<string>(() => {}) : Promise.resolve("ok"); }, o);
  await Promise.resolve(); h.vuur();
  assert.equal(await p, "ok");
  assert.deepEqual([k, slaap.length], [2, 1]);
});
await t("metRetry: 429, 3040, dagquota en gewone fouten worden niet opnieuw geprobeerd", async () => {
  for (const e of [Object.assign(new Error("x"), { status: 429 }), new Error("3040: Capacity temporarily exceeded"), new Error(DAG), new Error("Ongeldige invoer")]) {
    const { o, slaap } = optie();
    let k = 0;
    await assert.rejects(metRetry(async () => { k++; throw e; }, o), (x) => x === e);
    assert.deepEqual([k, slaap.length], [1, 0]);
  }
});
await t("logregel bevat geen prompt, sleutel of foutbericht", async () => {
  const { o, log } = optie();
  await assert.rejects(metRetry(async () => { throw new Error("Bearer geheim123 prompt-tekst"); }, o));
  assert.ok(log.every((r) => !/geheim|prompt/.test(r)));
});
await t("chat: elke mislukte poging wordt apart gemeten, het succes erna ook", async () => {
  const u = nieuw();
  let k = 0;
  const ai: any = { run: async () => { if (++k === 1) throw new Error("3043: Internal server error"); return { response: "ok", usage: { prompt_tokens: 10, completion_tokens: 5, neurons: 2 } }; } };
  const log = console.error; console.error = () => {};
  try { assert.equal(await chat(ai, MODEL, "sys", "user", 100, u), "ok"); } finally { console.error = log; }
  const [ri, ro] = RATES[MODEL];
  const fout = (Math.ceil(7 / 3.5) * ri + 50 * ro) / 1e6; // invoer + half max_tokens
  assert.equal(k, 2);
  assert.equal(u.calls, 2);
  assert.ok(Math.abs(u.neurons - (fout + 2)) < 1e-9);
  assert.ok(Math.abs((u.foutN || 0) - fout) < 1e-9);
});
await t("chat: 429 en dagquota krijgen geen retry (dagquota kost geen uitvoer)", async () => {
  const log = console.error; console.error = () => {};
  try {
    const dq = nieuw(); let k = 0;
    await assert.rejects(chat({ run: async () => { k++; throw new Error(DAG); } } as any, MODEL, "s", "u", 100, dq));
    assert.equal(k, 1);
    assert.equal(dq.outTok, 0); // dagquota-weigering kost geen uitvoer
    const rl = nieuw(); k = 0;
    await assert.rejects(chat({ run: async () => { k++; throw Object.assign(new Error("Too Many Requests"), { status: 429 }); } } as any, MODEL, "s", "u", 100, rl));
    assert.equal(k, 1);
  } finally { console.error = log; }
});
await t("LlmTimeout wordt in meetFout als gewone fout geteld (uitvoer half max_tokens)", async () => {
  const { meetFout } = await import("../src/budget");
  const u = nieuw();
  meetFout(u, RATES[MODEL], "x".repeat(35), 100, new LlmTimeout(45000));
  assert.equal(u.outTok, 50);
});
await t("metRetry: timeout zonder magRetry krijgt geen retry; met magRetry=false ook niet", async () => {
  for (const extra of [{}, { magRetry: () => false }]) {
    const h = handmatig();
    const { o, slaap } = optie({ timer: h.timer, ...extra });
    let k = 0;
    const p = metRetry(() => { k++; return new Promise<string>(() => {}); }, o);
    await Promise.resolve(); h.vuur();
    await assert.rejects(p, (e) => e instanceof LlmTimeout);
    assert.deepEqual([k, slaap.length], [1, 0]);
  }
});
await t("metRetry: 5xx blijft een retry krijgen zonder magRetry", async () => {
  const { o } = optie(); let k = 0;
  assert.equal(await metRetry(async () => { if (++k === 1) throw new Error("3043: x"); return "ok"; }, o), "ok");
});
await t("keten timeout -> meetFout -> retry (nep-timer), en geen retry als het budget het niet toelaat", async () => {
  const { meetFout } = await import("../src/budget");
  for (const ruimte of [true, false]) {
    const h = handmatig(), u = nieuw(); let k = 0;
    const p = metRetry(() => (++k === 1 ? new Promise<string>(() => {}) : Promise.resolve("ok")), { ...optie({ timer: h.timer }).o, onFout: (e) => meetFout(u, RATES[MODEL], "sys" + "user", 100, e), magRetry: () => ruimte });
    await Promise.resolve(); h.vuur();
    if (ruimte) assert.equal(await p, "ok"); else await assert.rejects(p, (e) => e instanceof LlmTimeout);
    assert.equal(k, ruimte ? 2 : 1);
    assert.equal(u.outTok, 50); // de time-outpoging is gemeten (half max_tokens)
  }
});
await t("chat (Worker): 5xx krijgt een retry zonder de budgetcheck te vragen", async () => {
  // echte timer, korte timeout via usage.llmTimeoutMs is minimaal 1 s: daarom hier alleen de doorgifte met een 5xx
  const u = nieuw(); let k = 0, gevraagd = 0;
  (u as any).magRetry = () => { gevraagd++; return true; };
  const ai: any = { run: async () => { if (++k === 1) throw new Error("3043: x"); return { response: "ok" }; } };
  const log = console.error; console.error = () => {};
  try { assert.equal(await chat(ai, MODEL, "s", "u", 100, u), "ok"); } finally { console.error = log; }
  assert.equal(k, 2); assert.equal(gevraagd, 0); // 5xx vraagt niet om de budgetcheck
});
await t("Pages chat: timeout met te weinig ruimte = één call; met ruimte = retry; kosten van poging 1 tellen mee", async () => {
  const log = console.error; console.error = () => {};
  try {
    for (const ruimte of [false, true]) {
      const u = nieuw() as any; let k = 0;
      const ai: any = { run: () => (++k === 1 ? Promise.reject(new LlmTimeout(10)) : Promise.resolve({ response: "ok" })) };
      const magRetry = () => (ruimte ? 1000 : u.neurons + 10) - u.neurons >= 60;
      if (ruimte) assert.equal(await pagesChat(ai, MODEL, "sys", "user", 320, u, 1e3, magRetry), "ok");
      else await assert.rejects(pagesChat(ai, MODEL, "sys", "user", 320, u, 1e3, magRetry), (e) => e instanceof LlmTimeout);
      assert.equal(k, ruimte ? 2 : 1);
      assert.ok(u.neurons > 0 && u.outTok >= 160);
    }
  } finally { console.error = log; }
});
await t("Whisper: metTimeout geeft een timeout en geen tweede call (nooit retry)", async () => {
  const h = handmatig(); let k = 0;
  const p = metTimeout(() => { k++; return new Promise<string>(() => {}); }, WHISPER_TIMEOUT, h.timer);
  h.vuur();
  await assert.rejects(p, (e) => e instanceof LlmTimeout);
  assert.equal(k, 1);
});
console.log(`${n} tests ok`);
