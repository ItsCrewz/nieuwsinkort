import assert from "node:assert/strict";
import { llmAanroep } from "../worker/src/llm-aanroep";

const foutlog = console.error;
const logs: string[] = [];
console.error = (regel) => { logs.push(String(regel)); };
const slaap = async () => {};
try {
  let n = 0;
  const timer = () => ({ wacht: ++n === 1 ? Promise.reject(new Error("LLM_TIMEOUT")) : new Promise<never>(() => {}), stop: () => {} });
  assert.equal(await llmAanroep("m", async () => "ok", { timer, slaap }), "ok");
  assert.match(logs[0], /code=LLM_TIMEOUT model=m duur=\d+ms/);
  let pogingen = 0;
  assert.equal(await llmAanroep("m", async () => { if (++pogingen === 1) throw Object.assign(new Error("fout"), { status: 503 }); return "ok"; }, { slaap }), "ok");
  assert.equal(pogingen, 2);
  for (const [fout, code] of [[Object.assign(new Error("fout"), { status: 429 }), "LLM_RATE_LIMIT"], [new Error("daily free allocation"), "LLM_BUDGET"], [new Error("500 tokens"), "LLM_FOUT"]] as const) {
    pogingen = 0;
    await assert.rejects(llmAanroep("m", async () => { pogingen++; throw fout; }, { slaap }));
    assert.equal(pogingen, 1);
    assert.ok(logs.at(-1)?.includes(`code=${code}`));
  }
  pogingen = 0;
  assert.equal(await llmAanroep("m", async () => { if (++pogingen === 1) throw new Error("timed out"); return "ok"; }, { slaap }), "ok");
  assert.equal(pogingen, 2);
} finally { console.error = foutlog; }
console.log("llm-aanroep ok");
