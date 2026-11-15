// Opslagfouten tijdens BudgetLogica.reserveer(): geen blijvend uur-/dagverbruik bij mislukken, geen dubbele boeking bij succes.
import assert from "node:assert/strict";
import { BudgetLogica, type Opslag } from "../src/budget";

let n = 0;
const t = async (naam: string, fn: () => Promise<void>) => { await fn(); n++; console.log("✓", naam); };
const res = { datum: "2026-10-30", uur: "2026-10-30T10", nieuws: 3000, budget: 9000, reserve: 2000, marge: 30, schatting: 100 };
console.error = () => {};

function maak(atomair: boolean, faalOp: (op: string, k: string) => boolean = () => false, data = new Map<string, unknown>()) {
  const f = (op: string, k: string) => { if (faalOp(op, k)) throw new Error("opslagfout"); };
  const s: Opslag = {
    get: async (k) => data.get(k) as any,
    put: async (k, v) => { f("put", k); data.set(k, v); },
    delete: async (k) => { for (const x of [k].flat()) { f("delete", x); data.delete(x); } },
    list: async ({ prefix }) => { f("list", prefix); return new Map([...data].filter(([k]) => k.startsWith(prefix))) as any; },
  };
  if (atomair) s.putMany = async (o) => { for (const k of Object.keys(o)) f("put", k); for (const [k, v] of Object.entries(o)) data.set(k, v); };
  const kv = new Map<string, number>();
  let spiegelFout = false;
  const l = new BudgetLogica(s, { spiegel: async (d, x) => { if (spiegelFout) throw new Error("kv"); kv.set(d, x); return true; }, zaad: async () => 0 });
  return { l, data, kv, zetSpiegelFout: (b: boolean) => { spiegelFout = b; } };
}
const hersteld = (data: Map<string, unknown>) => {
  assert.equal(data.get("uur:2026-10-30T10"), undefined, "uurplaats niet verbruikt");
  assert.notEqual(data.get("video:2026-10-30"), 100, "dagverbruik niet geboekt");
};

for (const atomair of [true, false]) {
  const m = atomair ? "atomair" : "terugzetten";
  for (const sleutel of ["uur:", "video:", "videovuil:"]) {
    await t(`${m}: fout bij schrijven ${sleutel} laat niets verbruikt, volgende aanvraag slaagt`, async () => {
      let stuk = true;
      const { l, data } = maak(atomair, (op, k) => stuk && op === "put" && k.startsWith(sleutel) && !k.startsWith(sleutel === "video:" ? "videovuil:" : "~"));
      await assert.rejects(l.reserveer(res), /opslagfout/);
      hersteld(data);
      stuk = false;
      assert.deepEqual(await l.reserveer(res), { ok: true, video: 100 });
      assert.equal(data.get("uur:2026-10-30T10"), 1, "precies één uurplaats");
      // herstart: nieuwe logica op dezelfde opslag
      const { l: l2 } = maak(atomair, () => false, data);
      assert.equal(await l2.stand("2026-10-30"), 100);
    });
  }
}

await t("terugzetten: fout in het terugzetten zelf behoudt de oorspronkelijke fout", async () => {
  let teller = 0;
  const { l } = maak(false, (op, k) => op === "put" && (k.startsWith("uur:") || (k === "video:2026-10-30" && ++teller === 2)));
  await assert.rejects(l.reserveer(res), /opslagfout/);
});

for (const atomair of [true, false]) {
  await t(`${atomair ? "atomair" : "terugzetten"}: fout bij opruimen of spiegel na boeking geeft toch ok, zonder dubbele boeking`, async () => {
    let stuk = true;
    const { l, data, zetSpiegelFout, kv } = maak(atomair, (op) => op === "list" && stuk);
    assert.deepEqual(await l.reserveer(res), { ok: true, video: 100 });
    assert.equal(data.get("uur:2026-10-30T10"), 1);
    stuk = false;
    zetSpiegelFout(true);
    assert.deepEqual(await l.reserveer({ ...res, uur: "2026-10-30T11" }), { ok: true, video: 200 });
    assert.equal(data.get("videovuil:2026-10-30"), true, "markering blijft voor herstel van de spiegel");
    zetSpiegelFout(false);
    assert.equal(await l.stand("2026-10-30"), 200);
    assert.equal(kv.get("2026-10-30"), 200, "spiegel hersteld bij volgende aanroep");
    assert.equal(data.get("videovuil:2026-10-30"), undefined);
  });
}
console.log(`${n} tests ok`);
