import assert from "node:assert/strict";
import { dayDates } from "../../src/tijd";
import dagen from "./fixtures/weer-803.json";

const gevallen: [string, string[]][] = [
  ["2026-10-28T22:59:00Z", ["29 okt", "30 okt", "31 okt"]],
  ["2026-10-28T23:01:00Z", ["5 nov", "6 nov", "7 nov"]],
  ["2026-03-28T23:30:00Z", ["2 apr", "3 apr", "4 apr"]],
  ["2026-03-29T01:30:00Z", ["2 apr", "3 apr", "4 apr"]],
];
const oudeTz = process.env.TZ;
try {
  for (const tz of ["Europe/Amsterdam", "America/Los_Angeles", "Pacific/Auckland", "UTC"]) {
    process.env.TZ = tz;
    for (const [tijd, verwacht] of gevallen) {
      assert.deepEqual(dayDates(dagen, Date.parse(tijd)), verwacht, `${tz}: ${tijd}`);
    }
    assert.deepEqual(dayDates([{ dag: "onbekend" }, ...dagen, { dag: "" }], Date.parse(gevallen[0][0])), ["", ...gevallen[0][1], ""]);
  }
} finally {
  if (oudeTz === undefined) delete process.env.TZ;
  else process.env.TZ = oudeTz;
}
console.log("✓ weerdatums volgen de Amsterdamse kalender in verschillende tijdzones");
