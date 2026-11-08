// Randgevallen van bewaakteRun(): lege/lange fouten, geen overbodige writes, kapotte opslag, reset van de faalreeks.
import assert from "node:assert/strict";
import { bewaakteRun, type RunStatus } from "../worker/src/run-status";

let n = 0;
const t = async (name: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log("✓", name); };

// Vaste klok: alleen `new Date()` zonder argumenten wordt vervangen; alleen lokale doubles.
const EchteDate = Date;
let nu = "2026-01-01T10:00:00.000Z";
class VasteDate extends EchteDate {
  constructor(...args: any[]) { super(...(args.length ? args : [nu]) as [any]); }
}
(globalThis as any).Date = VasteDate;
const origineelError = console.error;
let gelogd = 0;
console.error = () => { gelogd++; };

const nepOpslag = (start?: RunStatus) => {
  const o = { status: start, puts: 0, kvWrites: [] as RunStatus[] };
  return {
    o,
    storage: { async get<T>() { return o.status as T | undefined; }, async put(_k: string, v: RunStatus) { o.puts++; o.status = v; } },
    kv: { async put(_k: string, v: string) { o.kvWrites.push(JSON.parse(v)); } },
  };
};

try {
  await t("fout zonder message geeft een nette 500 en telt als fout", async () => {
    const s = nepOpslag();
    const r = await bewaakteRun(() => Promise.reject({}), s.storage, s.kv);
    assert.equal(r.status, 500);
    assert.deepEqual(await r.json(), { ok: false, err: "[object Object]" });
    const leeg = await bewaakteRun(() => Promise.reject(new Error("")), s.storage, s.kv);
    assert.equal(leeg.status, 500);
    assert.equal(((await leeg.json()) as any).err, "Error");
    const niets = await bewaakteRun(() => Promise.reject(undefined), s.storage, s.kv);
    assert.equal(((await niets.json()) as any).err, "undefined");
    assert.equal(s.o.status?.faalReeks, 3);
  });

  await t("lange foutmelding wordt in de respons op 200 tekens afgekapt, niet in de status", async () => {
    const s = nepOpslag();
    const r = await bewaakteRun(() => Promise.reject(new Error("x".repeat(500))), s.storage, s.kv);
    assert.equal(((await r.json()) as any).err.length, 200);
    assert.deepEqual(Object.keys(s.o.status!).sort(), ["faalReeks", "laatsteFout", "laatsteOk"]);
    assert.ok(!JSON.stringify(s.o.status).includes("xxx"));
  });

  await t("geen schrijfactie als de status gelijk blijft", async () => {
    const s = nepOpslag({ faalReeks: 0, laatsteFout: null, laatsteOk: nu });
    const r = await bewaakteRun(async () => ({ ok: true }), s.storage, s.kv);
    assert.equal(r.status, 200);
    assert.equal(s.o.puts, 0);
    assert.equal(s.o.kvWrites.length, 0);
  });

  await t("opslag die bij get faalt: respons blijft gelijk, fout wordt gelogd, geen write", async () => {
    const s = nepOpslag();
    const kapot = { async get(): Promise<any> { throw new Error("storage stuk"); }, put: s.storage.put };
    const voor = gelogd;
    const ok = await bewaakteRun(async () => ({ a: 1 }), kapot, s.kv);
    assert.equal(ok.status, 200);
    assert.deepEqual(await ok.json(), { a: 1 });
    const fout = await bewaakteRun(() => Promise.reject(new Error("boem")), kapot, s.kv);
    assert.equal(fout.status, 500);
    assert.deepEqual(await fout.json(), { ok: false, err: "boem" });
    assert.equal(s.o.puts, 0);
    assert.equal(gelogd - voor, 3); // 1x run-fout + 2x opslag mislukt
  });

  await t("opslag die bij put faalt (storage of KV): respons blijft gelijk", async () => {
    const s = nepOpslag();
    const putKapot = { get: s.storage.get, async put(): Promise<void> { throw new Error("put stuk"); } };
    const r1 = await bewaakteRun(async () => ({ ok: true }), putKapot, s.kv);
    assert.equal(r1.status, 200);
    assert.deepEqual(await r1.json(), { ok: true });
    assert.equal(s.o.kvWrites.length, 0);
    const kvKapot = { async put(): Promise<void> { throw new Error("kv stuk"); } };
    const r2 = await bewaakteRun(() => Promise.reject(new Error("fout")), s.storage, kvKapot);
    assert.equal(r2.status, 500);
    assert.deepEqual(await r2.json(), { ok: false, err: "fout" });
  });

  await t("faalreeks loopt op en gaat na een geslaagde run terug naar 0", async () => {
    const s = nepOpslag();
    for (const tijd of ["2026-01-01T10:00:00.000Z", "2026-01-01T11:00:00.000Z", "2026-01-01T12:00:00.000Z"]) {
      nu = tijd;
      await bewaakteRun(() => Promise.reject(new Error("stuk")), s.storage, s.kv);
    }
    assert.equal(s.o.status?.faalReeks, 3);
    assert.equal(s.o.status?.laatsteFout, "2026-01-01T12:00:00.000Z");
    nu = "2026-01-01T13:00:00.000Z";
    await bewaakteRun(async () => ({ ok: true }), s.storage, s.kv);
    assert.deepEqual(s.o.status, { faalReeks: 0, laatsteFout: "2026-01-01T12:00:00.000Z", laatsteOk: "2026-01-01T13:00:00.000Z" });
    assert.deepEqual(s.o.kvWrites.at(-1), s.o.status);
  });
} finally {
  console.error = origineelError;
  (globalThis as any).Date = EchteDate;
}

console.log(`\n${n} tests geslaagd`);
