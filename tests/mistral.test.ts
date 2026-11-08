import assert from "node:assert/strict";
import { chat, type Usage } from "../worker/src/ai";
import { groq, mistral, keten, type LlmState } from "../worker/src/llm";

const origineel = globalThis.fetch;
const foutlog = console.error;
const logs: unknown[] = [];
const urls: string[] = [];
const verzoek = { sys: "s", user: "u", maxTokens: 10, json: true };
const sleutel = "voorbeeld-mistral-geheim";
console.error = (...args) => { logs.push(args); };
try {
  globalThis.fetch = (async (url, init) => {
    urls.push(String(url));
    const body = JSON.parse(String(init?.body));
    if (String(url).includes("groq")) return new Response("", { status: 429 });
    assert.equal(body.model, "mistral-small-latest");
    if (body.response_format) assert.deepEqual(body.response_format, { type: "json_object" });
    return Response.json({ choices: [{ message: { content: "antwoord" } }], usage: { prompt_tokens: 2, completion_tokens: 3 } });
  }) as typeof fetch;
  assert.equal(await keten([groq("voorbeeld-groq")!, mistral(sleutel)!], {}, verzoek, () => {}), "antwoord");
  assert.equal(urls.length, 4);
  assert.ok(urls.slice(0, 3).every((u) => u.includes("groq")));
  assert.equal(urls[3], "https://api.mistral.ai/v1/chat/completions");
  urls.length = 0;
  const ai = { run: async () => { throw new Error("quota"); } } as unknown as Ai;
  const usage: Usage = { neurons: 0, calls: 0, fails: 0, inTok: 0, outTok: 0, llm: { mistralSleutel: sleutel, state: {} } };
  assert.equal(await chat(ai, "cf", "s", "u", 10, usage), "antwoord");
  assert.equal(urls.length, 1);
  assert.equal(usage.aanbieders?.mistral.outTok, 3);
  assert.equal(mistral(), undefined);
  await assert.rejects(chat(ai, "cf", "s", "u", 10, { ...usage, llm: { state: {} } }), /cloudflare: quota/);
  let nu = Date.UTC(2026, 0, 31, 23, 59);
  const state: LlmState = {};
  const wacht = { totaal: 0, nu: () => nu };
  const beperkt = mistral(sleutel, "22")!;
  await keten([beperkt], state, verzoek, () => {}, wacht);
  nu = Date.UTC(2026, 1, 1);
  await keten([beperkt], state, verzoek, () => {}, wacht);
  nu += 86400000;
  await keten([beperkt], state, verzoek, () => {}, wacht);
  await assert.rejects(keten([beperkt], state, verzoek, () => {}, wacht), /uitgeput/);
  assert.equal(state["mistral:mistral-small-latest"].maandTokens, 22);
  globalThis.fetch = (async () => { throw new Error(sleutel); }) as typeof fetch;
  await assert.rejects(keten([mistral(sleutel)!], {}, verzoek, () => {}), (e: Error) => !e.message.includes(sleutel));
  assert.ok(!JSON.stringify(logs).includes(sleutel));
} finally {
  globalThis.fetch = origineel;
  console.error = foutlog;
}
console.log("mistral-tests geslaagd");
