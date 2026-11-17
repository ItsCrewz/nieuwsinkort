import assert from "node:assert/strict";
import { budget } from "../budget-do";
import { bewaarGroqStand } from "../../functions/samenvatting";
import type { LlmState } from "../../worker/src/llm";

const dag = "2026-11-02", key = `groq-chat:${dag}`;
const teller = (tokens: number): LlmState => ({ "groq:model": { dag, calls: 1, tokens, venster: [] } });
const begin = JSON.stringify({ "groq:model": { dag, calls: 2, tokens: 20, venster: [] } });
const doBudget = budget(new Map([[key, begin]]));
const kv = (doBudget.b as any).env.NIEUWS;
const lees = kv.get;
let storing = true, terugval = 0;
kv.get = async (k: string) => { if (storing) throw new Error("leesfout"); return lees(k); };
const env: any = {
  NIEUWS: { get: async () => { terugval++; return JSON.parse(begin); }, put: async () => { terugval++; } },
  BUDGET_DO: { idFromName: () => "dag", get: () => ({ fetch: (url: string, init: RequestInit) => doBudget.b.fetch(new Request(url, init)) }) },
};
await bewaarGroqStand(env, key, teller(5));
await bewaarGroqStand(env, key, teller(7));
assert.equal(doBudget.kv.get(key), begin, "leesfout overschrijft de bestaande spiegel niet");
assert.equal(terugval, 0, "de aanroeper telt de duurzaam bewaarde wijzigingen niet nogmaals via KV");
storing = false;
await bewaarGroqStand(env, key, teller(3));
let stand = JSON.parse(doBudget.kv.get(key)!)["groq:model"];
assert.deepEqual([stand.calls, stand.tokens], [5, 35]);
await bewaarGroqStand(env, key, teller(2));
stand = JSON.parse(doBudget.kv.get(key)!)["groq:model"];
assert.deepEqual([stand.calls, stand.tokens], [6, 37], "herstel telt eerdere wijzigingen slechts eenmaal");

const ontbreekt = budget();
await ontbreekt.call("groq-bij", { datum: dag, verschil: teller(4) });
assert.equal(JSON.parse(ontbreekt.kv.get(key)!)["groq:model"].tokens, 4);
console.log("✓ Groq-leesfout bewaart wijzigingen tot herstel (#1038)");
