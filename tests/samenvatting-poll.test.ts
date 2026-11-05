// Draai: npm run test. haalSamenvatting: sluiten stopt aanvraag en wachttimer; normale vervolgpoging blijft werken.
import assert from "node:assert/strict";
import { haalSamenvatting, svCache } from "../src/samenvattingcache";

const echteFetch = globalThis.fetch, echteTimeout = globalThis.setTimeout, echteClear = globalThis.clearTimeout;
const timers = new Map<number, () => void>();
let tid = 0;
globalThis.setTimeout = ((f: () => void) => { timers.set(++tid, f); return tid; }) as any;
globalThis.clearTimeout = ((i: number) => { timers.delete(i); }) as any;
const json = (o: any) => new Response(JSON.stringify(o));
const tick = () => new Promise<void>((r) => echteTimeout(r, 0));
try {
  // sluiten tijdens de wachttijd: timer weg, geen nieuwe fetch
  svCache.clear();
  let calls = 0;
  globalThis.fetch = (async () => { calls++; return json({ ok: false, code: "bezig", fout: "" }); }) as any;
  const ac = new AbortController();
  const p = haalSamenvatting("a", ac.signal);
  const afgewezen = assert.rejects(p, { name: "AbortError" });
  await tick(); await tick();
  assert.equal(calls, 1);
  assert.equal(timers.size, 1, "wachttimer loopt");
  ac.abort();
  await afgewezen;
  assert.equal(timers.size, 0, "timer opgeruimd");
  assert.equal(calls, 1, "geen nieuwe poging");

  // blad open: na 'bezig' volgt een tweede poging
  calls = 0;
  globalThis.fetch = (async () => (++calls === 1 ? json({ ok: false, code: "bezig", fout: "" }) : json({ ok: true, punten: ["x"], bron: "spraak" }))) as any;
  const p2 = haalSamenvatting("b", new AbortController().signal);
  await tick(); await tick();
  assert.equal(timers.size, 1);
  [...timers.values()][0](); timers.clear();
  const r: any = await p2;
  assert.equal(r.ok, true);
  assert.equal(calls, 2);

  // al afgebroken voor de wachttijd (fetch-antwoord komt na sluiten): geen wachttimer
  const ac3 = new AbortController();
  globalThis.fetch = (async () => { ac3.abort(); return json({ ok: false, code: "bezig", fout: "" }); }) as any;
  await assert.rejects(haalSamenvatting("c", ac3.signal), { name: "AbortError" });
  assert.equal(timers.size, 0);
} finally {
  globalThis.fetch = echteFetch; globalThis.setTimeout = echteTimeout; globalThis.clearTimeout = echteClear;
}
console.log("samenvatting-poll ok");
