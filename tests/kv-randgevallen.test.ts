import assert from "node:assert/strict";
import { begrensOg, schrijfRun } from "../src/kv";

let n = 0;
async function t(naam: string, test: () => void | Promise<void>) {
  await test();
  n++;
  console.log("✓", naam);
}

const links = Array.from({ length: 32 }, (_, i) => `https://nieuws.nl/${i}`);

await t("lege lijst blijft leeg", () => {
  assert.deepEqual(begrensOg([]), []);
});
await t("dubbele links verdwijnen met behoud van volgorde", () => {
  assert.deepEqual(begrensOg([links[2], links[0], links[2], links[1], links[0]]), [links[2], links[0], links[1]]);
});
await t("precies 30 unieke links blijven behouden", () => {
  assert.deepEqual(begrensOg(links.slice(0, 30)), links.slice(0, 30));
});
await t("meer dan 30 links worden na ontdubbelen afgekapt", () => {
  assert.deepEqual(begrensOg([links[0], links[0], ...links]), links.slice(0, 30));
});

await t("uur is afgerond voor state en meer, alarm wacht op beide", async () => {
  const acties: string[] = [];
  const vrijgeven: Record<string, () => void> = {};
  const run = schrijfRun({ put: async (key, value) => {
    acties.push(key);
    assert.deepEqual(JSON.parse(value), { tijd: "2026-01-01T00:00:00.000Z", sleutel: key });
    await new Promise<void>((resolve) => { vrijgeven[key] = resolve; });
  } }, ...(["uur", "state", "meer"].map((sleutel) => ({ tijd: "2026-01-01T00:00:00.000Z", sleutel })) as [object, object, object]), async () => { acties.push("alarm"); });
  assert.deepEqual(acties, ["uur"]);
  vrijgeven.uur();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(acties, ["uur", "state", "meer"]);
  vrijgeven.state();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(acties, ["uur", "state", "meer"]);
  vrijgeven.meer();
  await run;
  assert.deepEqual(acties, ["uur", "state", "meer", "alarm"]);
});

for (const sleutel of ["uur", "state", "meer"]) {
  await t(`schrijffout voor ${sleutel} houdt andere acties niet tegen`, async () => {
    const acties: string[] = [];
    const fouten: unknown[][] = [];
    const fout = new Error("gesimuleerde schrijffout");
    const origineel = console.error;
    try {
      console.error = (...args: unknown[]) => { fouten.push(args); };
      await schrijfRun({ put: async (key) => {
        acties.push(key);
        if (key === sleutel) throw fout;
      } }, {}, {}, {}, async () => { acties.push("alarm"); });
    } finally { console.error = origineel; }
    assert.deepEqual(acties, ["uur", "state", "meer", "alarm"]);
    assert.deepEqual(fouten, [[`KV-schrijffout ${sleutel}`, fout]]);
  });
}

const vangFouten = async <T>(f: () => Promise<T>) => {
  const fouten: unknown[][] = [];
  const origineel = console.error;
  try { console.error = (...args: unknown[]) => { fouten.push(args); }; return { uitkomst: await f(), fouten }; }
  finally { console.error = origineel; }
};

await t("alarmfout na geslaagde uur-write: gelogd, publicatie telt als gelukt", async () => {
  const fout = new Error("gesimuleerde alarmfout");
  const { uitkomst, fouten } = await vangFouten(() => schrijfRun({ put: async () => {} }, {}, {}, {}, async () => { throw fout; }));
  assert.equal(uitkomst, true);
  assert.deepEqual(fouten, [["Video-alarm plannen mislukt", fout]]);
});

await t("uur-write en alarm falen allebei: mislukking en beide fouten gelogd", async () => {
  const putFout = new Error("put stuk");
  const alarmFout = new Error("alarm stuk");
  const { uitkomst, fouten } = await vangFouten(() => schrijfRun({ put: async (key) => { if (key === "uur") throw putFout; } }, {}, {}, {}, async () => { throw alarmFout; }));
  assert.equal(uitkomst, false);
  assert.deepEqual(fouten, [["KV-schrijffout uur", putFout], ["Video-alarm plannen mislukt", alarmFout]]);
});

await t("volgende run plant het alarm opnieuw na eerdere planningsfout", async () => {
  let alarmen = 0;
  const alarm = async () => { alarmen++; if (alarmen === 1) throw new Error("eerste keer stuk"); };
  const eerste = await vangFouten(() => schrijfRun({ put: async () => {} }, {}, {}, {}, alarm));
  const tweede = await vangFouten(() => schrijfRun({ put: async () => {} }, {}, {}, {}, alarm));
  assert.equal(eerste.fouten.length, 1);
  assert.equal(tweede.fouten.length, 0);
  assert.equal(tweede.uitkomst, true);
  assert.equal(alarmen, 2);
});

await t("normaal pad: precies 3 KV-writes, 1 alarm, geen fouten", async () => {
  const puts: string[] = [];
  let alarmen = 0;
  const { uitkomst, fouten } = await vangFouten(() => schrijfRun({ put: async (key) => { puts.push(key); } }, {}, {}, {}, async () => { alarmen++; }));
  assert.equal(uitkomst, true);
  assert.deepEqual(puts, ["uur", "state", "meer"]);
  assert.equal(alarmen, 1);
  assert.equal(fouten.length, 0);
});

console.log(`\n${n} tests geslaagd`);
