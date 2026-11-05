// #478: lege succesrun zichtbaar (skipped-log buiten het venster, LEGE RUN-waarschuwing). Nep-DO, geen netwerk, geen AI.
import assert from "node:assert/strict";
import worker from "../worker/src/index";
import { legeRun } from "../worker/src/opslag";

let n = 0;
const t = async (naam: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log("✓", naam); };

// geplande tijd: h:m Amsterdam op een wintertijddag (UTC+1)
const winter = (h: number, m = 0) => Date.UTC(2026, 0, 14, h - 1, m);

async function draai(tijd: number, antwoord: Response) {
  const logs: string[] = [], warns: string[] = [];
  const l = console.log, w = console.warn;
  console.log = (...a: unknown[]) => { logs.push(a.join(" ")); };
  console.warn = (...a: unknown[]) => { warns.push(a.join(" ")); };
  let aanroepen = 0;
  const env: any = { RUNNER: { idFromName: () => "x", get: () => ({ fetch: async () => { aanroepen++; return antwoord; } }) } };
  try { await worker.scheduled!({ scheduledTime: tijd } as any, env, {} as any); } finally { console.log = l; console.warn = w; }
  return { logs, warns, aanroepen };
}

await t("buiten het venster (05:xx wintertijd): skipped-log en geen DO-aanroep", async () => {
  const r = await draai(winter(5, 15), Response.json({ ok: true }));
  assert.equal(r.aanroepen, 0);
  assert.ok(r.logs.some((s) => s.startsWith("skipped: buiten venster 06-23 Amsterdam (uur=5)")));
});

await t("in het venster (06:00) roept de DO aan, zonder skipped-log", async () => {
  const r = await draai(winter(6), Response.json({ ok: true, feeds: 40, kvWritesRun: 1, aiCalls: 2 }));
  assert.equal(r.aanroepen, 1);
  assert.ok(!r.logs.some((s) => s.startsWith("skipped:")));
  assert.equal(r.warns.length, 0);
});

await t("409: skipped-woordlijn", async () => {
  const r = await draai(winter(10), Response.json({ ok: false, overgeslagen: "vorige run nog bezig" }, { status: 409 }));
  assert.ok(r.logs.some((s) => s.startsWith("skipped: vorige run nog bezig")));
});

await t("scheduled waarschuwt bij leeg:true in het DO-antwoord", async () => {
  const r = await draai(winter(10), Response.json({ ok: true, leeg: true }));
  assert.ok(r.warns.some((s) => s.includes("LEGE RUN: success zonder effect")));
});

await t("legeRun: leeg alleen bij ok zonder feeds, KV-writes en AI-aanroepen", () => {
  assert.equal(legeRun({ ok: true, feeds: 0, kvWritesRun: 0, aiCalls: 0 }), true);
  // normale run zonder nieuws: feeds opgehaald, KV-write overgeslagen, geen AI
  assert.equal(legeRun({ ok: true, feeds: 40, kvWritesRun: 0, aiCalls: 0 }), false);
  assert.equal(legeRun({ ok: true, feeds: 0, kvWritesRun: 1, aiCalls: 0 }), false);
  assert.equal(legeRun({ ok: true, feeds: 0, kvWritesRun: 0, aiCalls: 3 }), false);
  assert.equal(legeRun({ ok: false, feeds: 0, kvWritesRun: 0, aiCalls: 0 }), false);
  assert.equal(legeRun({ ok: true }), false);
  assert.equal(legeRun(null), false);
});

console.log(`\n${n} lege-run-tests geslaagd`);
