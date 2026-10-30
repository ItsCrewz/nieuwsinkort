// Draai: npm run test  (bundelt met esbuild en draait met node)
import assert from "node:assert/strict";
import { bewaakteRun, type RunStatus } from "../worker/src/run-status";
import { onRequestGet as samenvattingGet } from "../functions/samenvatting";
import { onRequestGet as dataGet } from "../functions/data.json";
import { onRequestGet as meerGet } from "../functions/meer";

let n = 0;
const t = (name: string, fn: () => void | Promise<void>) => {
  const klaar = () => { n++; console.log("✓", name); };
  const resultaat = fn();
  if (resultaat instanceof Promise) return resultaat.then(klaar);
  klaar();
};

// Alleen lokale doubles: geen netwerk, Cloudflare of AI.
const fouten: unknown[][] = [];
const origineelError = console.error;
let status: RunStatus | undefined;
const writes: RunStatus[] = [];
const storage = {
  async get<T>() { return status as T | undefined; },
  async put(_key: string, value: RunStatus) { status = value; },
};
const runKv = { async put(_key: string, value: string) { writes.push(JSON.parse(value)); } };
console.error = (...args: unknown[]) => { fouten.push(args); };
try {
  const mislukt = () => Promise.reject(new Error("gesimuleerde uitzondering"));
  const r = await bewaakteRun(mislukt, storage, runKv);
  await bewaakteRun(mislukt, storage, runKv);
  t("run-exceptions loggen en verhogen de blijvende faalReeks", () => {
    assert.equal(r.status, 500);
    assert.equal(status?.faalReeks, 2);
    assert.ok(status?.laatsteFout);
    assert.equal(status?.laatsteOk, null);
    assert.equal(fouten.length, 2);
    assert.equal(writes.length, 2);
  });
  const laatsteFout = status?.laatsteFout;
  const ok = await bewaakteRun(async () => ({ ok: true }), storage, runKv);
  t("geslaagde run reset faalReeks en bewaart het laatste fouttijdstip", () => {
    assert.equal(ok.status, 200);
    assert.equal(status?.faalReeks, 0);
    assert.ok(status?.laatsteOk);
    assert.equal(status?.laatsteFout, laatsteFout);
    assert.deepEqual(writes[2], status);
  });
  const before = fouten.length;
  const kapot = { async get(): Promise<any> { throw new Error("KV onbereikbaar"); } };
  const data = await dataGet({ request: new Request("https://test/data.json"), env: {
    NIEUWS: kapot, ASSETS: { async fetch() { return Response.json({ items: [], filmpjes: [], dumpert: [] }); } },
  } });
  const meer = await meerGet({ request: new Request("https://test/meer?k=test"), env: { NIEUWS: kapot } });
  const samenvatting = await samenvattingGet({ request: new Request("https://test/samenvatting?id=test"), env: { NIEUWS: kapot } as any });
  t("Functions loggen KV-fouten en behouden hun fallback", () => {
    assert.equal(data.status, 200);
    assert.equal(meer.status, 404);
    assert.equal(samenvatting.status, 200);
    assert.equal(fouten.length - before, 4);
  });
  if (status) status.laatsteOk = null;
  const opslagFouten = fouten.length;
  const behouden = await bewaakteRun(async () => ({ ok: true }), storage, { async put() { throw new Error("KV stuk"); } });
  t("statusopslagfout wordt gelogd zonder een geslaagde run te verbergen", () => {
    assert.equal(behouden.status, 200);
    // Een veranderd tijdstip zorgt voor een nieuwe statuswrite.
    assert.equal(fouten.length, opslagFouten + 1);
  });
} finally {
  console.error = origineelError;
}

console.log(`\n${n} tests geslaagd`);
