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

await t("alarmfout wordt doorgegeven", async () => {
  const fout = new Error("gesimuleerde alarmfout");
  await assert.rejects(schrijfRun({ put: async () => {} }, {}, {}, {}, async () => { throw fout; }), (ontvangen) => ontvangen === fout);
});

console.log(`\n${n} tests geslaagd`);
