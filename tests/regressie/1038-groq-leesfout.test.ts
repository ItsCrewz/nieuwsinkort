import assert from "node:assert/strict";
import { budget } from "../budget-do";
import { bewaarGroqStand } from "../../functions/samenvatting";

const dag = "2026-11-02", key = `groq-chat:${dag}`;
const teller = (tokens: number) => ({ "groq:model": { dag, calls: 1, tokens, venster: [] } });
const bestaand = teller(20);
const doBudget = budget(new Map([[key, JSON.stringify(bestaand)]]));
const kv = (doBudget.b as any).env.NIEUWS;
const lees = kv.get;
let stuk = true, terugval = 0;
kv.get = async (k: string) => { if (stuk) throw new Error("tijdelijke leesfout"); return lees(k); };
const env: any = {
  NIEUWS: { get: async () => { terugval++; return bestaand; }, put: async () => { terugval++; } },
  BUDGET_DO: { idFromName: () => "dag", get: () => ({ fetch: (url: string, init: RequestInit) => doBudget.b.fetch(new Request(url, init)) }) },
};
await bewaarGroqStand(env, key, teller(5));
await bewaarGroqStand(env, key, teller(7));
assert.equal(doBudget.kv.get(key), JSON.stringify(bestaand));
assert.equal(terugval, 0, "de aanroeper telt het bewaarde verschil niet nogmaals via KV");
stuk = false;
await bewaarGroqStand(env, key, teller(3));
assert.equal(JSON.parse(doBudget.kv.get(key)!)["groq:model"].tokens, 35);
assert.equal(JSON.parse(doBudget.kv.get(key)!)["groq:model"].calls, 4);
await bewaarGroqStand(env, key, teller(2));
assert.equal(JSON.parse(doBudget.kv.get(key)!)["groq:model"].tokens, 37);

const leeg = budget();
await leeg.call("groq-bij", { datum: dag, verschil: teller(5) });
assert.equal(JSON.parse(leeg.kv.get(key)!)["groq:model"].tokens, 5);
console.log("✓ Groq-leesfout bewaart wijzigingen tot herstel (#1038)");
