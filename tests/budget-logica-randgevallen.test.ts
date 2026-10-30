// Randgevallen in src/budget.ts: dagteller bij UTC-datumwissel, oude state zonder neuronDag, quotaSleutel en BudgetLogica
// met een in-memory Opslag/Buiten. Legt het huidige gedrag vast; vaste tijdstempels, geen netwerk of echte tijd.
import assert from "node:assert/strict";
import { BudgetLogica, MAX_WHISPER_UUR, SLOT_TTL, nieuwsNeuronen, quotaSleutel, utcDag, zetDagTeller } from "../src/budget";
import type { Buiten, DagTeller, Opslag, Reservering } from "../src/budget";

let n = 0;
const t = async (naam: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log("✓", naam); };

const T0 = Date.UTC(2026, 9, 30, 10, 0, 0);
const opslag = (): Opslag & { data: Map<string, unknown> } => {
  const data = new Map<string, unknown>();
  return {
    data,
    async get(k) { return data.get(k) as any; },
    async put(k, v) { data.set(k, v); },
    async delete(k) { for (const x of Array.isArray(k) ? k : [k]) data.delete(x); },
    async list(o) { return new Map([...data].filter(([k]) => k.startsWith(o.prefix))) as any; },
  };
};
const maak = (zaad: number | null = 0) => {
  const s = opslag(), spiegel: [string, number][] = [];
  const buiten: Buiten = { async spiegel(d, x) { spiegel.push([d, x]); }, async zaad() { return zaad; } };
  let nu = T0;
  const l = new BudgetLogica(s, buiten, () => nu);
  return { s, l, spiegel, zet: (x: number) => { nu = x; } };
};
const res = (o: Partial<Reservering> = {}): Reservering => ({ datum: "2026-10-30", uur: "2026-10-30T10", nieuws: 0, budget: 9000, reserve: 0, marge: 0, schatting: 100, ...o });

await t("utcDag: UTC-middernacht en één ms ervoor", () => {
  assert.equal(utcDag(Date.UTC(2026, 9, 30, 23, 59, 59, 999)), "2026-10-30");
  assert.equal(utcDag(Date.UTC(2026, 9, 31, 0, 0, 0, 0)), "2026-10-31");
});

await t("nieuwsNeuronen: zelfde dag, andere dag, ontbrekende state", () => {
  const st: DagTeller = { datum: "2026-10-30", neuronDag: "2026-10-30", neurons: 120.5, calls: 3 };
  assert.equal(nieuwsNeuronen(st, "2026-10-30"), 120.5);
  assert.equal(nieuwsNeuronen(st, "2026-10-31"), 0, "na UTC-middernacht telt de oude dag niet");
  assert.equal(nieuwsNeuronen(null, "2026-10-30"), 0);
  assert.equal(nieuwsNeuronen(undefined, "2026-10-30"), 0);
});

await t("nieuwsNeuronen: oude state zonder neuronDag valt terug op datum; neuronDag wint", () => {
  const oud: DagTeller = { datum: "2026-10-30", neurons: 77, calls: 1 };
  assert.equal(nieuwsNeuronen(oud, "2026-10-30"), 77);
  assert.equal(nieuwsNeuronen(oud, "2026-10-29"), 0);
  const gemengd: DagTeller = { datum: "2026-10-30", neuronDag: "2026-10-29", neurons: 50, calls: 1 };
  assert.equal(nieuwsNeuronen(gemengd, "2026-10-29"), 50);
  assert.equal(nieuwsNeuronen(gemengd, "2026-10-30"), 0);
});

await t("nieuwsNeuronen: niet-numerieke neurons geven 0", () => {
  assert.equal(nieuwsNeuronen({ datum: "d", neuronDag: "d", neurons: NaN, calls: 0 }, "d"), 0);
  assert.equal(nieuwsNeuronen({ datum: "d", neuronDag: "d", neurons: "12" as any, calls: 0 }, "d"), 12);
});

await t("zetDagTeller: zelfde dag laat tellers staan", () => {
  const st: DagTeller = { datum: "2026-10-30", neuronDag: "2026-10-30", neurons: 10, calls: 2, inTok: 5, outTok: 6, geschat: 1, foutN: 0.5 };
  zetDagTeller(st, "2026-10-30");
  assert.deepEqual(st, { datum: "2026-10-30", neuronDag: "2026-10-30", neurons: 10, calls: 2, inTok: 5, outTok: 6, geschat: 1, foutN: 0.5 });
});

await t("zetDagTeller: datumwissel nult alles en zet neuronDag; datum blijft", () => {
  const st: DagTeller = { datum: "2026-10-30", neuronDag: "2026-10-30", neurons: 10, calls: 2, inTok: 5, outTok: 6, geschat: 1, foutN: 0.5 };
  zetDagTeller(st, "2026-10-31");
  assert.deepEqual(st, { datum: "2026-10-30", neuronDag: "2026-10-31", neurons: 0, calls: 0, inTok: 0, outTok: 0, geschat: 0, foutN: 0 });
});

await t("zetDagTeller: oude state zonder neuronDag", () => {
  const zelfde: DagTeller = { datum: "2026-10-30", neurons: 9, calls: 1 };
  zetDagTeller(zelfde, "2026-10-30");
  assert.equal(zelfde.neuronDag, "2026-10-30");
  assert.equal(zelfde.neurons, 9, "zelfde dag: geen reset");
  assert.equal(zelfde.inTok, undefined);
  const andere: DagTeller = { datum: "2026-10-29", neurons: 9, calls: 1 };
  zetDagTeller(andere, "2026-10-30");
  assert.deepEqual([andere.neuronDag, andere.neurons, andere.calls, andere.inTok], ["2026-10-30", 0, 0, 0]);
});

await t("quotaSleutel: vaste vorm per UTC-dag", () => {
  assert.equal(quotaSleutel("2026-10-30"), "ai-quota:2026-10-30");
  assert.equal(quotaSleutel(utcDag(Date.UTC(2026, 9, 31, 0, 0, 0))), "ai-quota:2026-10-31");
  assert.notEqual(quotaSleutel("2026-10-30"), quotaSleutel("2026-10-31"));
});

await t("reserveer: tot precies het budget is ok, één neuron erboven niet", async () => {
  const { l, s, spiegel } = maak(0);
  // nieuws 8000 + video 0 + reserve 500 + marge 400 + schatting 100 = 9000
  const r = await l.reserveer(res({ nieuws: 8000, reserve: 500, marge: 400 }));
  assert.deepEqual(r, { ok: true, video: 100 });
  assert.equal(s.data.get("video:2026-10-30"), 100);
  assert.equal(s.data.get("uur:2026-10-30T10"), 1);
  assert.deepEqual(spiegel, [["2026-10-30", 100]]);
  // video staat nu op 100: 8000 + 100 + 500 + 400 + 0,1 > 9000
  const net = await l.reserveer(res({ nieuws: 8000, reserve: 500, marge: 400, schatting: 0.1 }));
  assert.deepEqual(net, { ok: false, reden: "budget", video: 100 });
  assert.equal(s.data.get("uur:2026-10-30T10"), 1, "geweigerd: geen uurteller of videoteller erbij");
  assert.equal(spiegel.length, 1);
});

await t("reserveer: geweigerd bij schatting net boven budget", async () => {
  const { l, s } = maak(0);
  const r = await l.reserveer(res({ nieuws: 8900, schatting: 100.1 }));
  assert.deepEqual(r, { ok: false, reden: "budget", video: 0 });
  assert.equal(s.data.has("uur:2026-10-30T10"), false);
});

await t("reserveer: afronding op één decimaal en zaad wordt bewaard", async () => {
  const { l, s } = maak(50.04);
  const r = await l.reserveer(res({ schatting: 0.06 }));
  assert.deepEqual(r, { ok: true, video: 50.1 });
  assert.equal(s.data.get("video:2026-10-30"), 50.1);
});

await t("stand: onleesbare KV (zaad null) geeft 0 en bewaart niets", async () => {
  const { l, s } = maak(null);
  assert.equal(await l.stand("2026-10-30"), 0);
  assert.equal(s.data.has("video:2026-10-30"), false);
});

await t("reserveer: uurrem bij MAX_WHISPER_UUR, volgend uur wel", async () => {
  const { l, s } = maak(0);
  s.data.set("uur:2026-10-30T10", MAX_WHISPER_UUR - 1);
  assert.equal((await l.reserveer(res())).ok, true);
  const vol = await l.reserveer(res());
  assert.deepEqual([vol.ok, (vol as any).reden], [false, "druk"]);
  assert.equal((await l.reserveer(res({ uur: "2026-10-30T11" }))).ok, true);
});

await t("reserveer: nieuwe UTC-dag ruimt oude video- en uursleutels op", async () => {
  const { l, s } = maak(0);
  await l.reserveer(res());
  await l.reserveer(res({ datum: "2026-10-31", uur: "2026-10-31T00" }));
  assert.deepEqual([...s.data.keys()].sort(), ["uur:2026-10-31T00", "video:2026-10-31"]);
});

await t("verreken: negatieve delta begrenst op 0, delta 0 schrijft niets", async () => {
  const { l, s, spiegel } = maak(0);
  await l.reserveer(res({ schatting: 100 }));
  assert.equal(await l.verreken("2026-10-30", -30), 70);
  assert.equal(await l.verreken("2026-10-30", -500), 0);
  const aantal = spiegel.length;
  assert.equal(await l.verreken("2026-10-30", 0), 0);
  assert.equal(spiegel.length, aantal);
  assert.equal(s.data.get("video:2026-10-30"), 0);
});

await t("claim: bezet tot precies SLOT_TTL, daarna vrij (tot <= nu)", async () => {
  const { l, s, zet } = maak(0);
  const a = await l.claim("vid-1");
  assert.ok(a);
  assert.deepEqual(s.data.get("slot:vid-1"), { tot: T0 + SLOT_TTL, tok: a });
  zet(T0 + SLOT_TTL - 1);
  assert.equal(await l.claim("vid-1"), null, "1 ms voor verlopen nog bezet");
  zet(T0 + SLOT_TTL);
  const b = await l.claim("vid-1");
  assert.ok(b && b !== a, "op de verlopen grens vrij, nieuw token");
});

await t("claim: verlopen sloten van andere id's worden opgeruimd", async () => {
  const { l, s, zet } = maak(0);
  await l.claim("a");
  zet(T0 + 1000);
  await l.claim("b");
  zet(T0 + SLOT_TTL + 1);
  await l.claim("c");
  assert.deepEqual([...s.data.keys()].sort(), ["slot:b", "slot:c"].filter((k) => s.data.has(k)).sort());
  assert.equal(s.data.has("slot:a"), false);
});

await t("geefVrij: verlopen eigenaar geeft het slot van een nieuwe eigenaar niet vrij", async () => {
  const { l, s, zet } = maak(0);
  const oud = (await l.claim("vid-1", 1000))!;
  zet(T0 + 1000);
  const nieuw = (await l.claim("vid-1", 1000))!;
  await l.geefVrij("vid-1", oud);
  assert.equal((s.data.get("slot:vid-1") as any).tok, nieuw);
  await l.geefVrij("vid-1", nieuw);
  assert.equal(s.data.has("slot:vid-1"), false);
});

console.log(`${n} tests ok`);
