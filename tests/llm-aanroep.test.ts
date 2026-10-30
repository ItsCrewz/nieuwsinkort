import assert from "node:assert/strict";
import { llmAanroep } from "../worker/src/llm-aanroep";

const foutlog = console.error;
const logs: unknown[][] = [];
console.error = (...args) => { logs.push(args); };
const slaap = async () => {};
try {
  // timeout: tweede poging slaagt
  let n = 0;
  const r = await llmAanroep("m", () => (++n === 1 ? new Promise<string>(() => {}) : Promise.resolve("ok")), { timeout: 5, slaap });
  assert.equal(r, "ok"); assert.equal(n, 2); assert.equal(logs[0][0], "LLM_TIMEOUT");

  // 5xx: eenmaal herhaald
  n = 0;
  assert.equal(await llmAanroep("m", async () => { if (++n === 1) throw Object.assign(new Error("boem"), { status: 503 }); return "ok"; }, { slaap }), "ok");
  assert.equal(n, 2);

  // 5xx blijft: na één herpoging gooit hij
  n = 0;
  await assert.rejects(llmAanroep("m", async () => { n++; throw new Error("HTTP 500"); }, { slaap }));
  assert.equal(n, 2);

  // 429: geen herpoging
  n = 0; logs.length = 0;
  await assert.rejects(llmAanroep("m", async () => { n++; throw new Error("429 too many requests"); }, { slaap }));
  assert.equal(n, 1); assert.equal(logs[0][0], "LLM_RATE_LIMIT");
} finally { console.error = foutlog; }
console.log("llm-aanroep ok");
