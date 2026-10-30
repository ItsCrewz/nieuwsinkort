import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { budget } from "./budget-do";

Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
let n = 0;
const t = async (naam: string, fn: () => Promise<void>) => { await fn(); n++; console.log("✓", naam); };
// ---- Budget-DO: slot, reservering, verrekening en uurrem (in-memory opslag, geen Cloudflare)
const res = (o: any = {}) => ({ datum: "2026-10-30", uur: "2026-10-30T10", nieuws: 3000, budget: 9000, reserve: 2000, marge: 30, schatting: 100, ...o });
await t("Budget: slot claimen, vrijgeven en verlopen", async () => {
  const { call, data } = budget();
  const a = (await call("claim", { id: "vid-1" })).tok;
  assert.ok(a);
  assert.equal((await call("claim", { id: "vid-1" })).tok, null, "bezig");
  assert.ok((await call("claim", { id: "vid-2" })).tok, "ander id kan wel");
  await call("vrij", { id: "vid-1", tok: "fout" });
  assert.equal((await call("claim", { id: "vid-1" })).tok, null, "verkeerd token geeft niets vrij");
  await call("vrij", { id: "vid-1", tok: a });
  assert.ok((await call("claim", { id: "vid-1" })).tok, "na vrijgeven weer vrij");
  (data.get("slot:vid-1") as any).tot = Date.now() - 1;
  assert.ok((await call("claim", { id: "vid-1" })).tok, "verlopen slot is vrij");
});
await t("Budget: reserveren, boven budget geweigerd, verrekenen met spiegel in KV", async () => {
  const { call, kv } = budget();
  assert.deepEqual(await call("reserveer", res()), { ok: true, video: 100 });
  assert.equal(kv.get("vid-neurons:2026-10-30"), "100");
  // 3000 + 100 + 2000 + 30 + schatting > 9000 vanaf schatting 3871
  assert.equal((await call("reserveer", res({ schatting: 3870 }))).ok, true);
  const geweigerd = await call("reserveer", res({ schatting: 100 }));
  assert.deepEqual([geweigerd.ok, geweigerd.reden], [false, "budget"]);
  assert.equal((await call("stand", { datum: "2026-10-30" })).video, 3970, "geweigerd verandert niets");
  assert.equal((await call("verreken", { datum: "2026-10-30", delta: -70.04 })).video, 3900);
  assert.equal(kv.get("vid-neurons:2026-10-30"), "3900");
  assert.equal((await call("verreken", { datum: "2026-10-30", delta: -1e9 })).video, 0, "nooit negatief");
});
await t("Budget: zaait de dagstand uit de KV-spiegel", async () => {
  const { call } = budget(new Map([["vid-neurons:2026-10-30", "500"]]));
  assert.equal((await call("stand", { datum: "2026-10-30" })).video, 500);
  assert.equal((await call("reserveer", res({ schatting: 10 }))).video, 510);
});
await t("Budget: gelijktijdige reserveringen met trage zaad overschrijven elkaar niet", async () => {
  const kv = new Map([["vid-neurons:2026-10-30", "500"]]);
  const { b, call } = budget(kv);
  const echt = (b as any).env.NIEUWS.get;
  (b as any).env.NIEUWS.get = async (k: string) => { await new Promise((r) => setTimeout(r, 20)); return echt(k); };
  const uit = await Promise.all([1, 2, 3, 4, 5].map(() => call("reserveer", res({ schatting: 10 }))));
  assert.deepEqual(uit.map((x) => x.video).sort((x, y) => x - y), [510, 520, 530, 540, 550]);
  assert.equal(kv.get("vid-neurons:2026-10-30"), "550");
});
await t("Budget: uurrem staat op 30 en geldt per uur", async () => {
  const { call, data } = budget();
  for (let i = 0; i < 30; i++) assert.equal((await call("reserveer", res({ schatting: 1 }))).ok, true);
  const vol = await call("reserveer", res({ schatting: 1 }));
  assert.deepEqual([vol.ok, vol.reden], [false, "druk"]);
  assert.equal((await call("reserveer", res({ schatting: 1, uur: "2026-10-30T11" }))).ok, true, "volgend uur weer ruimte");
  assert.equal([...data.keys()].filter((k) => k.startsWith("uur:2026-10-30T")).length, 2);
  await call("reserveer", res({ datum: "2026-10-31", uur: "2026-10-31T06", schatting: 1 }));
  assert.deepEqual([...data.keys()].filter((k) => k.startsWith("uur:") || k.startsWith("video:")).sort(), ["uur:2026-10-31T06", "video:2026-10-31"], "oude dag opgeruimd");
});
await t("Budget: onbekende actie en GET worden geweigerd", async () => {
  const { b } = budget();
  assert.equal((await b.fetch(new Request("https://do/claim"))).status, 405);
  assert.equal((await b.fetch(new Request("https://do/x", { method: "POST", body: "{}" }))).status, 404);
});

console.log(`\n${n} Budget-DO-tests geslaagd`);
