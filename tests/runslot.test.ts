// Draai: npm run test  (bundelt met esbuild en draait met node)
import assert from "node:assert/strict";
import { neemSlot, geefSlot, meetInterval, runsOver, runPlafonds, voorafTeller } from "../worker/src/runslot";
import { bewaakteRun, type RunStatus } from "../worker/src/run-status";
import { MAX_ALARMS_PER_UUR } from "../worker/src/vooraf";
import { ams } from "../src/tijd";

let n = 0;
const t = (name: string, fn: () => void | Promise<void>) => {
  const klaar = () => { n++; console.log("✓", name); };
  const r = fn();
  if (r instanceof Promise) return r.then(klaar);
  klaar();
};

// 2026-03-04 is wintertijd (UTC+1); h:m Amsterdam -> epoch
const op = (h: number, m = 0) => Date.UTC(2026, 2, 4, h - 1, m);
const oud = (h: number) => Math.max(1, 23 - h + 1);
const BUDGET = 9000;

await t("interval 60: runsLeft, runBudget en diepRun gelijk aan de oude uurformule (uur 6..23)", () => {
  for (let h = 6; h <= 23; h++) for (const m of [0, 1, 30, 59]) {
    assert.equal(ams(op(h, m)).h, h);
    const rl = runsOver(op(h, m), 60);
    assert.equal(rl, oud(h));
    const rest = BUDGET - 1234.5;
    assert.equal(runPlafonds(rest, rl).runBudget, Math.max(300, (rest / oud(h)) * 2));
    assert.equal(runPlafonds(0, rl).diepRun(0.65 * BUDGET - 777), Math.max(120, Math.min(700, ((0.65 * BUDGET - 777) / oud(h)) * 2)));
  }
});

await t("zomertijd: interval 60 blijft per Amsterdams uur gelijk", () => {
  for (let h = 6; h <= 23; h++) assert.equal(runsOver(Date.UTC(2026, 6, 4, h - 2, 17), 60), oud(h));
});

await t("meetInterval: onbekend/0 → 60, 4 → 5, 17 → 15, 3 uur → 60", () => {
  const nu = op(10);
  assert.equal(meetInterval(undefined, nu), 60);
  assert.equal(meetInterval(nu, nu), 60);
  assert.equal(meetInterval(nu - 4 * 60e3, nu), 5);
  assert.equal(meetInterval(nu - 17 * 60e3, nu), 15);
  assert.equal(meetInterval(nu - 5 * 60e3, nu), 5);
  assert.equal(meetInterval(nu - 60 * 60e3, nu), 60);
  assert.equal(meetInterval(nu - 3 * 3600e3, nu), 60);
});

await t("emulatie */5 en */15: runBudget ~1/12 resp. 1/4 van uurlijks en dagbudget niet vóór 12:00 op", () => {
  for (const [iv, factor] of [[5, 12], [15, 4]] as const) {
    for (const h of [6, 10, 15, 22]) {
      const rest = 90000; // groot genoeg om boven de ondergrens van 300 te blijven
      const uurlijks = runPlafonds(rest, runsOver(op(h), 60)).runBudget;
      const nu = runPlafonds(rest, runsOver(op(h), iv), iv).runBudget;
      assert.ok(nu > 300 && Math.abs(nu - uurlijks / factor) <= 1, `${iv} uur ${h}: ${nu} vs ${uurlijks / factor}`);
    }
    let rest = BUDGET, voor12 = 0;
    for (let min = 6 * 60; min < 24 * 60; min += iv) {
      const nu = op(Math.floor(min / 60), min % 60);
      const plafond = Math.min(rest, runPlafonds(rest, runsOver(nu, iv), iv).runBudget); // volledig verbruik per run
      rest -= plafond;
      if (min < 12 * 60) voor12 += plafond;
    }
    assert.ok(rest >= 0 && voor12 < BUDGET, `${iv}: voor 12:00 verbruikt ${voor12}`);
    // niet sneller dan uurlijks
    let restU = BUDGET, voor12U = 0;
    for (let h = 6; h < 24; h++) { const p = Math.min(restU, runPlafonds(restU, oud(h)).runBudget); restU -= p; if (h < 12) voor12U += p; }
    assert.ok(voor12 <= voor12U + 1, `${iv}: ${voor12} > uurlijks ${voor12U}`);
  }
});

// fake DO-opslag
const maakOpslag = () => {
  const m = new Map<string, unknown>();
  return { m, async get<T>(k: string) { return m.get(k) as T | undefined; }, async put(k: string, v: unknown) { m.set(k, v); }, async delete(k: string) { m.delete(k); } };
};

await t("run-slot: tweede run krijgt geen slot, oud slot wordt overgenomen, vrijgeven wist alleen eigen slot", async () => {
  const o = maakOpslag(), nu = 1_000_000_000;
  assert.equal(await neemSlot(o, nu), true);
  assert.equal(await neemSlot(o, nu + 5 * 60e3), false);
  assert.equal(await neemSlot(o, nu + 10 * 60e3), true); // verlopen = crash
  await geefSlot(o, nu); // oude run mag het nieuwe slot niet wissen
  assert.equal(o.m.get("runSlot"), nu + 10 * 60e3);
  await geefSlot(o, nu + 10 * 60e3);
  assert.equal(o.m.has("runSlot"), false);
});

await t("run-slot: overgeslagen run raakt run-status niet; slot vrij na exception", async () => {
  const o = maakOpslag(); const fouten: unknown[][] = []; const orig = console.error; console.error = (...a) => { fouten.push(a); };
  try {
    const kv = { async put() {} };
    const nu = 5_000_000;
    // zoals Runner.fetch: slot nemen, anders 409 zonder bewaakteRun
    const draai = async (tijd: number, run: () => Promise<unknown>) => {
      if (!await neemSlot(o, tijd)) return Response.json({ ok: false, overgeslagen: "vorige run nog bezig" }, { status: 409 });
      try { return await bewaakteRun(run, o as any, kv); } finally { await geefSlot(o, tijd); }
    };
    let vrij!: () => void;
    const eerste = draai(nu, () => new Promise((r) => { vrij = () => r({ ok: true }); }));
    await new Promise((r) => setTimeout(r, 0));
    const tweede = await draai(nu + 1000, async () => ({ ok: true }));
    assert.equal(tweede.status, 409);
    assert.deepEqual(await tweede.json(), { ok: false, overgeslagen: "vorige run nog bezig" });
    assert.equal(o.m.has("run-status"), false);
    vrij(); await eerste;
    assert.equal((o.m.get("run-status") as RunStatus).faalReeks, 0);
    const kapot = await draai(nu + 20 * 60e3, () => Promise.reject(new Error("boem")));
    assert.equal(kapot.status, 500);
    assert.equal((o.m.get("run-status") as RunStatus).faalReeks, 1);
    assert.equal(o.m.has("runSlot"), false);
    assert.equal((await draai(nu + 21 * 60e3, async () => ({ ok: true }))).status, 200);
  } finally { console.error = orig; }
});

await t("alarmteller: 12 runs in één uur resetten niet; nieuw uur wel; n blijft ≤ MAX", () => {
  let k: { uur: number; n: number } | undefined;
  let resets = 0;
  for (let i = 0; i < 12; i++) {
    const nieuw = voorafTeller(k, 10);
    if (nieuw !== k) resets++;
    k = nieuw;
    if (k.n < MAX_ALARMS_PER_UUR) k.n++; // alarm() verhoogt hooguit tot MAX
  }
  assert.equal(resets, 1);
  assert.ok(k!.n <= MAX_ALARMS_PER_UUR && k!.n === MAX_ALARMS_PER_UUR);
  assert.deepEqual(voorafTeller(k, 11), { uur: 11, n: 0 });
});

console.log(`${n} tests ok`);
