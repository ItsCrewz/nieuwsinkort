import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import worker, { Runner } from "../worker/src/index";

Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
let n = 0;
const t = async (naam: string, fn: () => Promise<void>) => { await fn(); n++; console.log("✓", naam); };
const sleutel = "uitsluitend-test-fixture";
let starts = 0;
const env: any = {
  RUN_KEY: sleutel,
  RUNNER: { idFromName: () => "runner", get: () => ({ fetch: async () => { starts++; return Response.json({ ok: true }); } }) },
  NIEUWS: { get: async () => "{}", put: async () => {} },
};
await t("Worker weigert URL-sleutel, onjuiste of ontbrekende Bearer en ontbrekend secret", async () => {
  for (const pad of ["/run", "/uur"]) {
    for (const headers of [{}, { Authorization: "Bearer fout" }, { Authorization: `Basic ${sleutel}` }]) {
      assert.equal((await worker.fetch(new Request(`https://lokaal${pad}?key=${sleutel}`, { headers: headers as Record<string, string> }), env)).status, 403);
    }
    assert.equal((await worker.fetch(new Request(`https://lokaal${pad}`, { headers: { Authorization: `Bearer ${sleutel}` } }), { ...env, RUN_KEY: undefined })).status, 403);
  }
  assert.equal(starts, 0);
});
await t("Worker accepteert Bearer voor run en uur", async () => {
  for (const pad of ["/run", "/uur"]) assert.equal((await worker.fetch(new Request(`https://lokaal${pad}`, { headers: { Authorization: `Bearer ${sleutel}` } }), env)).status, 200);
  assert.equal(starts, 1);
});
function runner() {
  const data = new Map<string, unknown>();
  const ctx: any = { storage: { get: async (k: string) => data.get(k), put: async (k: string, v: unknown) => { data.set(k, v); }, delete: async (k: string) => { data.delete(k); } }, blockConcurrencyWhile: async (fn: () => Promise<unknown>) => fn() };
  return { r: new Runner(ctx, env), data };
}
await t("Runner weigert force binnen tien minuten na gewone of geforceerde run", async () => {
  const { r, data } = runner();
  let runs = 0;
  r.run = async () => { runs++; return { ok: true } as any; };
  assert.equal((await r.fetch(new Request("https://do/run"))).status, 200);
  assert.equal((await r.fetch(new Request("https://do/run?force=1"))).status, 429);
  data.set("laatsteRun", Date.now() - 10 * 60e3);
  assert.equal((await r.fetch(new Request("https://do/run?force=1"))).status, 200);
  assert.equal((await r.fetch(new Request("https://do/run?force=1"))).status, 429);
  assert.equal(runs, 2);
});
await t("Runner logt stack, begrenst foutmelding en bewaart limiet na fout", async () => {
  const { r } = runner();
  const fout = new Error("x".repeat(250));
  r.run = async () => { throw fout; };
  const oud = console.error;
  const logs: unknown[] = [];
  console.error = (e) => { logs.push(e); };
  try {
    const res = await r.fetch(new Request("https://do/run?force=1"));
    assert.equal(res.status, 500);
    assert.deepEqual(await res.json(), { ok: false, err: "x".repeat(200) });
    assert.deepEqual(logs, [fout.stack]);
    assert.equal((await r.fetch(new Request("https://do/run?force=1"))).status, 429);
  } finally { console.error = oud; }
});

console.log(`\n${n} Worker-run-tests geslaagd`);
