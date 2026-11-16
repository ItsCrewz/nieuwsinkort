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

let puts = 0;
const storing = budget(new Map([[key, JSON.stringify(bestaand)]]), { opslagPutFout: () => ++puts === 2 });
const storingEnv: any = {
  NIEUWS: { get: async () => JSON.parse(storing.kv.get(key)!), put: async (_k: string, v: string) => { storing.kv.set(key, v); } },
  BUDGET_DO: { idFromName: () => "dag", get: () => ({ fetch: (url: string, init: RequestInit) => storing.b.fetch(new Request(url, init)) }) },
};
await bewaarGroqStand(storingEnv, key, teller(5));
assert.equal(JSON.parse(storing.kv.get(key)!)["groq:model"].tokens, 20);
await bewaarGroqStand(storingEnv, key, teller(3));
assert.equal(JSON.parse(storing.kv.get(key)!)["groq:model"].tokens, 28);
assert.equal(JSON.parse(storing.kv.get(key)!)["groq:model"].calls, 3);

const verloren = budget(new Map([[key, JSON.stringify(bestaand)]]));
let antwoordKwijt = true;
const verlorenEnv: any = {
  NIEUWS: { get: async () => JSON.parse(verloren.kv.get(key)!), put: async (_k: string, v: string) => { verloren.kv.set(key, v); } },
  BUDGET_DO: { idFromName: () => "dag", get: () => ({ fetch: async (url: string, init: RequestInit) => {
    const antwoord = await verloren.b.fetch(new Request(url, init));
    if (antwoordKwijt) { antwoordKwijt = false; throw new Error("antwoord verloren"); }
    return antwoord;
  } }) },
};
await bewaarGroqStand(verlorenEnv, key, teller(5));
await bewaarGroqStand(verlorenEnv, key, teller(3));
assert.equal(JSON.parse(verloren.kv.get(key)!)["groq:model"].tokens, 28);
assert.equal(JSON.parse(verloren.kv.get(key)!)["groq:model"].calls, 3);
console.log("✓ Groq-leesfout bewaart wijzigingen tot herstel (#1038)");
