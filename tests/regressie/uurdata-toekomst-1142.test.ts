import assert from "node:assert/strict";
import { merge } from "../../src/dagdata";
import { TOEKOMST_MARGE } from "../../src/vandaag";

const nu = Date.parse("2026-11-04T10:00:00Z");
const tijd = (ms: number) => new Date(ms).toISOString();
const routine = { gegenereerd: tijd(nu - 3600e3), dag_samenvatting: "routine", tab_samenvatting: { nl: "routine" }, weer: { nu: { temp: 10 } }, items: [], filmpjes: [], dumpert: [] };
const uur = { gegenereerd: tijd(nu), dag_samenvatting: "uur", tab_samenvatting: { nl: "uur" }, weer: { nu: { temp: 12 } }, items: [], filmpjes: [], dumpert: [] };
const origineel = Date.now;
Date.now = () => nu;
try {
  for (const moment of [nu, nu + TOEKOMST_MARGE]) {
    const uit = merge(routine, { ...uur, gegenereerd: tijd(moment) });
    assert.equal(uit.dag_samenvatting, "uur");
    assert.equal(uit.tab_samenvatting.nl, "uur");
    assert.equal(uit.weer.nu.temp, 12);
    assert.equal(uit.gegenereerd, tijd(moment));
  }
  for (const moment of [nu + TOEKOMST_MARGE + 1, Date.parse("2026-11-04T20:00:00Z"), nu - 86400e3]) {
    assert.equal(merge(routine, { ...uur, gegenereerd: tijd(moment) }), routine);
    assert.equal(merge(null, { ...uur, gegenereerd: tijd(moment) }), null);
  }
  assert.equal(merge(routine, null), routine);
  assert.equal(merge(routine, { ...uur, gegenereerd: undefined }), routine);
  const ouder = merge(routine, { ...uur, gegenereerd: tijd(nu - 7200e3) });
  assert.equal(ouder.dag_samenvatting, "routine");
  assert.equal(ouder.gegenereerd, routine.gegenereerd);
} finally {
  Date.now = origineel;
}
console.log("✓ uurdata: actuele tijd, klokmarge en te verre toekomst (#1142)");
