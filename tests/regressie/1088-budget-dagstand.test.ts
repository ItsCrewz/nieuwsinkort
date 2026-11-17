// Regressie #1088: een onleesbare dagstand mag geen nulstand of reservering worden.
import assert from "node:assert/strict";
import { BudgetLogica, type Opslag, type Reservering } from "../../src/budget";
import { kvPoort } from "../../functions/samenvatting";

const data = new Map<string, unknown>();
const opslag: Opslag = {
  async get(k) { return data.get(k) as any; },
  async put(k, v) { data.set(k, v); },
  async delete(k) { for (const x of Array.isArray(k) ? k : [k]) data.delete(x); },
  async list(o) { return new Map([...data].filter(([k]) => k.startsWith(o.prefix))) as any; },
};
const r: Reservering = { datum: "2026-10-30", uur: "2026-10-30T10", nieuws: 0, budget: 9000, reserve: 0, marge: 0, schatting: 100 };
let zaad: number | null = null;
const l = new BudgetLogica(opslag, { async zaad() { return zaad; }, async spiegel() {} });
await assert.rejects(l.reserveer(r));
assert.equal(data.size, 0);
zaad = 500;
assert.deepEqual(await l.reserveer(r), { ok: true, video: 600 });
zaad = null;
assert.deepEqual(await l.reserveer(r), { ok: true, video: 700 });
assert.equal(data.get(`uur:${r.uur}`), 2);

const kv = new Map<string, string>();
let stuk = true;
const poort = kvPoort({ NIEUWS: {
  async get(k: string) { if (stuk) throw new Error("KV"); return kv.get(k) ?? null; },
  async put(k: string, v: string) { kv.set(k, v); },
  async delete(k: string) { kv.delete(k); },
} } as any);
await assert.rejects(poort.stand(r.datum));
await assert.rejects(poort.reserveer(r));
assert.equal(kv.size, 0);
stuk = false;
kv.set(`vid-neurons:${r.datum}`, "500");
assert.equal(await poort.reserveer(r), "ok");
assert.equal(kv.get(`vid-neurons:${r.datum}`), "600");
kv.delete(`vid-neurons:${r.datum}`);
assert.equal(await poort.reserveer(r), "ok");
assert.equal(kv.get(`vid-neurons:${r.datum}`), "100");
console.log("✓ budgetdagstand blijft betrouwbaar bij leesfout en herstel");
