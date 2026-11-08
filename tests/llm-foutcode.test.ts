import assert from "node:assert/strict";
import { groq, mistral, keten } from "../worker/src/llm";

const origineel = globalThis.fetch, foutlog = console.error;
const logs: unknown[][] = [];
const sleutel = "voorbeeld-geheime-sleutel";
const verzoek = { sys: "s", user: "u", maxTokens: 10, json: false };
console.error = (...args) => { logs.push(args); };
try {
  const gevallen = [
    { aanbieder: groq(sleutel)!, status: 400, body: JSON.stringify({ error: { code: "invalid_request_error", type: "invalid_request", message: sleutel } }), extra: { code: "invalid_request_error", type: "invalid_request" } },
    { aanbieder: mistral(sleutel)!, status: 429, body: JSON.stringify({ error: { code: "rate_limit", type: "rate_limit_error", message: sleutel } }), extra: { code: "rate_limit", type: "rate_limit_error" } },
    { aanbieder: mistral(sleutel)!, status: 429, body: JSON.stringify({ error: { type: "rate_limit_error" } }), extra: { type: "rate_limit_error" } },
    { aanbieder: groq(sleutel)!, status: 400, body: "geen json", extra: undefined },
    { aanbieder: mistral(sleutel)!, status: 429, body: JSON.stringify({ error: { code: null, type: 42, message: sleutel } }), extra: undefined },
    { aanbieder: groq(sleutel)!, status: 400, body: JSON.stringify({ error: { code: sleutel, type: "tekst met geheim " + sleutel } }), extra: undefined },
  ];
  for (const { aanbieder, status, body, extra } of gevallen) {
    logs.length = 0;
    globalThis.fetch = (async () => new Response(body, { status, headers: { "X-Test": sleutel } })) as typeof fetch;
    await assert.rejects(keten([aanbieder], {}, verzoek, () => {}), /AI-keten uitgeput/);
    assert.deepEqual(logs[0], ["AI-aanbieder mislukt", aanbieder.naam, aanbieder.modellen[0], `HTTP ${status}`, ...(extra ? [extra] : [])]);
    assert.ok(!JSON.stringify(logs).includes(sleutel));
  }
  logs.length = 0;
  let calls = 0;
  globalThis.fetch = (async () => ++calls === 1
    ? Response.json({ error: { code: "invalid_request_error" } }, { status: 400 })
    : Response.json({ choices: [{ message: { content: "antwoord" } }] })) as typeof fetch;
  assert.equal(await keten([groq(sleutel)!], {}, verzoek, () => {}), "antwoord");
  assert.equal(calls, 2);
  assert.deepEqual(logs[0], ["AI-aanbieder mislukt", "groq", "openai/gpt-oss-120b", "HTTP 400", { code: "invalid_request_error" }]);

  logs.length = 0;
  globalThis.fetch = (async () => ({ ok: false, status: 429, json: async () => { throw new Error(sleutel); } }) as unknown as Response) as typeof fetch;
  await assert.rejects(keten([mistral(sleutel)!], {}, verzoek, () => {}), /AI-keten uitgeput/);
  assert.deepEqual(logs[0], ["AI-aanbieder mislukt", "mistral", "mistral-small-latest", "HTTP 429"]);
} finally {
  globalThis.fetch = origineel;
  console.error = foutlog;
}
console.log("llm-foutcode-tests geslaagd");