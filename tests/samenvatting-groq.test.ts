import assert from "node:assert/strict";
import { onRequestPost } from "../functions/samenvatting";

const tekst = "Dit is een voldoende lange transcriptie over het nieuws van vandaag en meer informatie.";
async function scenario(sleutel: boolean, audioFout = false) {
  const opslag = new Map<string, string>();
  const video = { href: "https://www.dumpert.nl/item/test", embed: "https://media.example/test.mp4", titel: "Test", bron: "Test" };
  opslag.set("uur", JSON.stringify({ filmpjes: [video] }));
  const calls: string[] = [];
  const env: any = { GROQ_API_KEY: sleutel ? "test" : undefined, NIEUWS: {
    get: async (k: string, type: string) => type === "json" ? JSON.parse(opslag.get(k) || "null") : opslag.get(k) || null,
    put: async (k: string, v: string) => { opslag.set(k, v); }, delete: async (k: string) => { opslag.delete(k); },
  }, ASSETS: { fetch: async () => Response.json({}) }, AI: { run: async (model: string) => {
    calls.push(model);
    return model.includes("whisper") ? { text: tekst, transcription_info: { duration: 20 } } : { response: "- Eerste punt van het nieuws\n- Tweede punt van het nieuws" };
  } } };
  globalThis.fetch = (async (url: any, init: any) => {
    const u = String(url); calls.push(u);
    if (u.includes("audio/transcriptions")) {
      assert.equal(init.body.get("model"), "whisper-large-v3-turbo");
      assert.equal(init.body.get("response_format"), "verbose_json");
      return audioFout ? new Response("", { status: 429 }) : Response.json({ text: tekst, duration: 20 });
    }
    if (u.includes("chat/completions")) return Response.json({ choices: [{ message: { content: "- Eerste punt van het nieuws\n- Tweede punt van het nieuws" } }] });
    return new Response(new Uint8Array(100));
  }) as typeof fetch;
  const request = new Request("https://nieuwsinkort.nl/samenvatting", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: "d-test" }) });
  const antwoord = await (await onRequestPost({ request, env })).json() as any;
  return { antwoord, calls, opslag };
}
const origineel = globalThis.fetch;
try {
  const groq = await scenario(true);
  assert.equal(groq.antwoord.ok, true);
  assert.equal(groq.antwoord.neuronen, 0);
  assert.equal(groq.calls.filter((x) => x.includes("api.groq.com")).length, 2);
  assert.equal([...groq.opslag.keys()].some((x) => x.startsWith("vid-neurons:")), false);
  const oud = await scenario(false);
  assert.equal(oud.antwoord.ok, true);
  assert.equal(oud.calls.filter((x) => x.startsWith("@cf/")).length, 2);
  assert.ok([...oud.opslag.keys()].some((x) => x.startsWith("vid-neurons:")));
  const terugval = await scenario(true, true);
  assert.equal(terugval.antwoord.ok, true);
  assert.equal(terugval.calls.filter((x) => x.includes("whisper-large")).length, 1);
  assert.ok(terugval.antwoord.neuronen > 0);
} finally { globalThis.fetch = origineel; }
console.log("samenvatting Groq: geslaagd");
