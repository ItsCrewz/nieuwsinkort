import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { budget } from "./budget-do";
import { onRequestPost, addNeurons, bewaarGroqStand, doPoort, kvPoort } from "../functions/samenvatting";
import { somStand, verschilStand, telOp, groqTokens, bewaarLlmVerschil, kopieStand, type LlmState } from "../worker/src/llm";

Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
// #431: Groq-dagstand (Worker + Function) en vid-neurons zonder verloren schrijfacties; nep-KV met vertraging, geen netwerk
let n = 0;
const t = async (naam: string, fn: () => Promise<void>) => { await fn(); n++; console.log("✓", naam); };
const dag = new Date().toISOString().slice(0, 10);
const pauze = () => new Promise<void>((r) => setTimeout(r, Math.random() * 3));
// KV met vertraging bij elke bewerking, zodat gelijktijdige lezen-en-schrijven echt door elkaar lopen
function nepKv(start: Record<string, string> = {}) {
  const m = new Map(Object.entries(start));
  return { m, get: async (k: string, type?: string) => { await pauze(); const v = m.get(k) ?? null; return type === "json" ? (v ? JSON.parse(v) : null) : v; }, put: async (k: string, v: string) => { await pauze(); m.set(k, v); }, delete: async (k: string) => { m.delete(k); } };
}
const teller = (tokens: number, calls = 1): LlmState[string] => ({ dag, calls, tokens, venster: [] });

await t("somStand/verschilStand/telOp: alleen het eigen verschil telt, andere dag begint opnieuw", async () => {
  const eigen: LlmState = { "groq:a": teller(100, 1) };
  const ander: LlmState = { "groq:a": teller(50, 2), "groq:b": teller(10, 1), "mistral:x": teller(999), "groq:oud": { dag: "2000-01-01", calls: 9, tokens: 9, venster: [] } };
  const basis = somStand(eigen, ander, dag);
  assert.deepEqual([basis["groq:a"].tokens, basis["groq:a"].calls, basis["groq:b"].tokens, !!basis["mistral:x"], !!basis["groq:oud"]], [150, 3, 10, false, false]);
  assert.equal(eigen["groq:a"].tokens, 100, "invoer niet gemuteerd");
  const voor = kopieStand(basis);
  basis["groq:a"].tokens += 30; basis["groq:a"].calls++;
  basis["groq:c"] = teller(7, 1);
  const verschil = verschilStand(voor, basis);
  assert.deepEqual([verschil["groq:a"].tokens, verschil["groq:a"].calls, verschil["groq:b"].tokens, verschil["groq:c"].tokens], [30, 1, 0, 7]);
  const vers: LlmState = { "groq:a": teller(500, 5), "groq:oud": { dag: "2000-01-01", calls: 9, tokens: 9, venster: [] } };
  telOp(vers, verschil);
  assert.equal(vers["groq:a"].tokens, 530);
  assert.equal(vers["groq:c"].tokens, 7);
  telOp(vers, { "groq:oud": { dag, calls: 1, tokens: 4, venster: [] } });
  assert.equal(vers["groq:oud"].tokens, 4, "oude dag wordt vervangen");
  assert.equal(groqTokens(dag, vers, { "groq:z": teller(1000), "mistral:q": teller(5) }), 530 + 7 + 4 + 1000);
});

await t("bewaarGroqStand: gelijktijdige verzoeken verliezen elkaars stand niet", async () => {
  const kv = nepKv();
  const key = `groq-chat:${dag}`;
  await Promise.all(Array.from({ length: 25 }, (_, i) => bewaarGroqStand({ NIEUWS: kv } as any, key, { "groq:openai/gpt-oss-120b": teller(10 + i, 1) })));
  const s = JSON.parse(kv.m.get(key)!) as LlmState;
  assert.equal(s["groq:openai/gpt-oss-120b"].calls, 25);
  assert.equal(s["groq:openai/gpt-oss-120b"].tokens, 25 * 10 + (24 * 25) / 2);
});

// twee verschillende filmpjes tegelijk door de Function, beide via Groq
const tekst = "Dit is een voldoende lange transcriptie over het nieuws van vandaag en meer informatie.";
function omgeving(kv: ReturnType<typeof nepKv>, ids: string[]) {
  kv.m.set("uur", JSON.stringify({ filmpjes: ids.map((id) => ({ href: `https://www.dumpert.nl/item/${id}`, embed: "https://media.example/test.mp4", titel: "Test", bron: "Test" })) }));
  return { GROQ_API_KEY: "test", NIEUWS: kv, ASSETS: { fetch: async () => Response.json({}) }, AI: { run: async () => { throw new Error("geen Cloudflare"); } } } as any;
}
const post = (env: any, id: string) => onRequestPost({ request: new Request("https://nieuwsinkort.nl/samenvatting", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }), env } as any);
const origineel = globalThis.fetch;
try {
  await t("Function: gelijktijdige verzoeken tellen allemaal mee in groq-chat", async () => {
    const kv = nepKv();
    const ids = ["a1", "b2", "c3", "d4", "e5"];
    const env = omgeving(kv, ids);
    const modellen: string[] = [];
    globalThis.fetch = (async (url: any, init: any) => {
      const u = String(url);
      if (u.includes("audio/transcriptions")) return Response.json({ text: tekst, duration: 20 });
      if (u.includes("chat/completions")) { await pauze(); modellen.push(JSON.parse(init.body).model); return Response.json({ choices: [{ message: { content: "- Eerste punt van het nieuws\n- Tweede punt van het nieuws" } }], usage: { prompt_tokens: 100, completion_tokens: 50 } }); }
      return new Response(new Uint8Array(100));
    }) as typeof fetch;
    const antwoorden = await Promise.all(ids.map((id) => post(env, `d-${id}`).then((r) => r.json() as Promise<any>)));
    assert.ok(antwoorden.every((a) => a.ok), JSON.stringify(antwoorden));
    const s = JSON.parse(kv.m.get(`groq-chat:${dag}`)!) as LlmState;
    assert.equal(Object.values(s).reduce((x, y) => x + y.calls, 0), ids.length, "elke chat-aanroep staat in de stand");
    assert.equal(modellen.length, ids.length);
    assert.equal(groqTokens(dag, s), Object.values(s).reduce((x, y) => x + y.tokens, 0));
  });
  await t("Function: Worker-stand telt mee voor de dagslimiet per model", async () => {
    const kv = nepKv({ state: JSON.stringify({ llm: { "groq:openai/gpt-oss-120b": teller(199990, 3) } }) });
    const env = omgeving(kv, ["x9"]);
    const modellen: string[] = [];
    globalThis.fetch = (async (url: any, init: any) => {
      const u = String(url);
      if (u.includes("audio/transcriptions")) return Response.json({ text: tekst, duration: 20 });
      if (u.includes("chat/completions")) { modellen.push(JSON.parse(init.body).model); return Response.json({ choices: [{ message: { content: "- Eerste punt van het nieuws\n- Tweede punt van het nieuws" } }] }); }
      return new Response(new Uint8Array(100));
    }) as typeof fetch;
    assert.equal(((await (await post(env, "d-x9")).json()) as any).ok, true);
    assert.deepEqual(modellen, ["qwen/qwen3.8-27b"], "120b is volgens de Worker-stand vol");
    const s = JSON.parse(kv.m.get(`groq-chat:${dag}`)!) as LlmState;
    assert.equal(s["groq:openai/gpt-oss-120b"], undefined, "de meegenomen Worker-stand wordt niet in groq-chat gekopieerd");
    assert.equal(s["groq:qwen/qwen3.8-27b"].calls, 1);
  });
} finally { globalThis.fetch = origineel; }

await t("Worker: bewaarLlmVerschil schrijft het verbruik van een mislukte run bij in state", async () => {
  const kv = nepKv({ state: JSON.stringify({ neurons: 5, llm: { "groq:m": teller(100, 1) } }) });
  const voor: LlmState = { "groq:m": teller(100, 1) };
  const na: LlmState = { "groq:m": teller(160, 3), "groq:n": teller(40, 1) };
  assert.equal(await bewaarLlmVerschil(kv, voor, na), true);
  const st = JSON.parse(kv.m.get("state")!);
  assert.equal(st.neurons, 5, "rest van state ongemoeid");
  assert.deepEqual([st.llm["groq:m"].tokens, st.llm["groq:m"].calls, st.llm["groq:n"].tokens], [160, 3, 40]);
  assert.equal(await bewaarLlmVerschil(nepKv(), voor, na), false, "zonder state niets schrijven");
  const stuk = { get: async () => { throw new Error("KV weg"); }, put: async () => {} };
  assert.equal(await bewaarLlmVerschil(stuk as any, voor, na), false, "fout wordt gelogd, niet gegooid");
});

await t("vid-neurons (DO): gelijktijdige reserveringen en verrekeningen kloppen en spiegelen", async () => {
  const { call, kv } = budget();
  const r = (o: any = {}) => ({ datum: "2026-10-30", uur: "2026-10-30T10", nieuws: 100, budget: 9000, reserve: 100, marge: 30, schatting: 10, ...o });
  const ok = await Promise.all(Array.from({ length: 20 }, () => call("reserveer", r())));
  assert.ok(ok.every((x) => x.ok));
  assert.equal(kv.get("vid-neurons:2026-10-30"), "200");
  await Promise.all(Array.from({ length: 10 }, (_, i) => call("verreken", { datum: "2026-10-30", delta: i % 2 ? -2 : 3 })));
  assert.equal(kv.get("vid-neurons:2026-10-30"), String(200 + 5 * 3 - 5 * 2));
  assert.equal((await call("stand", { datum: "2026-10-30" })).video, 205);
});
await t("vid-neurons (DO): mislukte spiegel wordt bij de volgende aanroep hersteld", async () => {
  let stuk = true;
  const { call, kv } = budget(new Map(), { putFout: () => stuk });
  const res = { datum: "2026-10-30", uur: "2026-10-30T10", nieuws: 100, budget: 9000, reserve: 100, marge: 30, schatting: 50 };
  assert.equal((await call("reserveer", res)).video, 50, "DO-stand blijft leidend");
  assert.equal(kv.get("vid-neurons:2026-10-30"), undefined, "spiegel achterloopt");
  stuk = false;
  assert.equal((await call("stand", { datum: "2026-10-30" })).video, 50);
  assert.equal(kv.get("vid-neurons:2026-10-30"), "50", "stand herstelt de spiegel");
});
await t("vid-neurons (KV-terugval): gelijktijdige addNeurons en reserveringen verliezen niets", async () => {
  const kv = nepKv();
  const env: any = { NIEUWS: kv };
  await Promise.all(Array.from({ length: 30 }, () => addNeurons(env, "vid-neurons:d", 2)));
  assert.equal(kv.m.get("vid-neurons:d"), "60");
  const poort = kvPoort(env);
  const res = { datum: "e", uur: "u1", nieuws: 0, budget: 100000, reserve: 0, marge: 0, schatting: 5 };
  const uit = await Promise.all(Array.from({ length: 20 }, () => poort.reserveer(res)));
  assert.ok(uit.every((x) => x === "ok"));
  assert.equal(kv.m.get("vid-neurons:e"), "100");
  assert.equal(kv.m.get("vs-uur:u1"), "20");
});
await t("vid-neurons (DO-poort): een verloren verrekening wordt één keer opnieuw geprobeerd en anders gelogd", async () => {
  let aanroepen = 0, faalAlles = false;
  const ns: any = { idFromName: () => "x", get: () => ({ fetch: async () => { aanroepen++; if (faalAlles || aanroepen === 1) throw new Error("DO weg"); return Response.json({ video: 1 }); } }) };
  const poort = doPoort(ns);
  await poort.verreken("d", 5);
  assert.equal(aanroepen, 2, "tweede poging slaagt");
  aanroepen = 0; faalAlles = true;
  await poort.verreken("d", 5);
  assert.equal(aanroepen, 2, "hooguit één nieuwe poging");
});
console.log(`${n} tests ok`);
