import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { budget } from "./budget-do";
import type { LlmState } from "../worker/src/llm";

const dag = "2026-11-02", key = `groq-chat:${dag}`;
const teller = (tokens: number): LlmState => ({ "groq:model": { dag, calls: 1, tokens, venster: [] } });
const start = { "groq:model": { dag, calls: 2, tokens: 20, venster: [] } };
const kv = new Map<string, string>([[key, JSON.stringify(start)]]);
const doBudget = budget(kv);
let writes = 0, calls = 0;
const echtePut = (doBudget.b as any).env.NIEUWS.put;
(doBudget.b as any).env.NIEUWS.put = async (...args: unknown[]) => { writes++; return echtePut(...args); };
const env: any = {
  NIEUWS: { get: async (k: string) => JSON.parse(kv.get(k) || "null"), put: async (k: string, v: string) => { writes++; kv.set(k, v); } },
  BUDGET_DO: { idFromName: () => "dag", get: () => ({ fetch: async (url: string, init: RequestInit) => { calls++; return doBudget.b.fetch(new Request(url, init)); } }) },
};

// Afzonderlijke bundels hebben elk hun eigen modulevariabelen, zoals verschillende isolates.
const { build } = createRequire(`${process.cwd()}/package.json`)("esbuild") as typeof import("esbuild");
const bundel = await build({ entryPoints: ["functions/samenvatting.ts"], bundle: true, platform: "node", format: "esm", write: false });
const code = Buffer.from(bundel.outputFiles[0].contents).toString("base64");
const isolates = await Promise.all(Array.from({ length: 5 }, (_, i) => import(`data:text/javascript;base64,${code}#${i}`)));
await Promise.all(Array.from({ length: 25 }, (_, i) => isolates[i % isolates.length].bewaarGroqStand(env, key, teller(i + 1))));
const stand = JSON.parse(kv.get(key)!);
assert.equal(stand["groq:model"].calls, 27);
assert.equal(stand["groq:model"].tokens, 20 + 325);
assert.equal(writes, 25, "maximaal één DO-aanroep en KV-spiegel per wijziging");
assert.equal(calls, 25);
await isolates[0].bewaarGroqStand(env, key, {});
assert.equal(writes, 25, "geen wijziging geeft geen schrijfopdracht");
assert.equal(calls, 25);

for (const fout of ["status", "uitzondering"]) {
  const terugvalKv = new Map([[key, JSON.stringify(start)]]);
  const terugvalEnv: any = {
    NIEUWS: { get: async (k: string) => JSON.parse(terugvalKv.get(k) || "null"), put: async (k: string, v: string) => { terugvalKv.set(k, v); } },
    BUDGET_DO: { idFromName: () => "dag", get: () => ({ fetch: async () => { if (fout === "uitzondering") throw new Error("DO-fout"); return new Response("fout", { status: 503 }); } }) },
  };
  await isolates[0].bewaarGroqStand(terugvalEnv, key, teller(5));
  assert.equal(JSON.parse(terugvalKv.get(key)!)["groq:model"].tokens, 25, `KV-terugval bij ${fout}`);
}

const validatie = budget(new Map([[key, JSON.stringify(start)]]));
for (const waarde of [{ calls: "1" }, { tokens: null }, { maandTokens: "2" }, { venster: {} }, null, []]) {
  const r = await validatie.b.fetch(new Request("https://do/groq-bij", { method: "POST", body: JSON.stringify({ datum: dag, verschil: { "groq:model": waarde } }) }));
  assert.equal(r.status, 400);
  assert.equal(validatie.kv.get(key), JSON.stringify(start));
  assert.equal(validatie.data.size, 0);
}

let stuk = true;
const herstel = budget(new Map([[key, JSON.stringify(start)]]), { putFout: () => stuk });
await herstel.call("groq-bij", { datum: dag, verschil: teller(5) });
assert.equal(JSON.parse(herstel.kv.get(key)!)["groq:model"].tokens, 20);
stuk = false;
await herstel.call("groq-bij", { datum: dag, verschil: teller(7) });
assert.equal(JSON.parse(herstel.kv.get(key)!)["groq:model"].tokens, 32, "volgende wijziging herstelt de spiegel zonder verlies");
console.log("✓ Groq-teller over meerdere isolates en herstel van KV-spiegel (#445)");
