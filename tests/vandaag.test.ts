import assert from "node:assert/strict";
import { alleenVandaag, nieuwsteTijd, publicatieTijd, vanVandaag } from "../src/vandaag";
import { midnight } from "../src/tijd";

for (const dag of ["2026-10-25T12:00:00+01:00", "2026-10-26T12:00:00+01:00", "2026-03-29T12:00:00+02:00", "2026-03-30T12:00:00+02:00"]) {
  const now = Date.parse(dag), grens = midnight(now);
  assert.equal(vanVandaag(grens - 1000, now), false);
  assert.equal(vanVandaag(grens, now), true);
}
const now = Date.parse("2026-10-30T10:00:00+01:00");
assert.equal(publicatieTijd(null, now), null);
assert.equal(publicatieTijd(NaN, now), null);
assert.equal(publicatieTijd(now + 15 * 60e3, now), now + 15 * 60e3);
assert.equal(publicatieTijd(now + 3600e3, now), now);
assert.equal(publicatieTijd(now + 3 * 3600e3, now), null);
assert.equal(nieuwsteTijd([{ d: 1 }, { d: 3 }, { d: 2 }]), 3);
const data = { gegenereerd: new Date(now).toISOString(), dag_samenvatting: "nieuws", items: [{ tijd: "23:59" }, { tijd: "10:20" }, { tijd: "00:00", t: midnight(now) }, { tijd: "09:00", t: midnight(now) - 1 }], filmpjes: [{ tijd: "09:00" }], dumpert: [{ tijd: "23:00" }] };
const vandaag = alleenVandaag(data, now);
assert.equal(vandaag.items.length, 2);
assert.deepEqual(vandaag.oud, { items: 2, filmpjes: 0, dumpert: 1 });
const oud = alleenVandaag({ ...data, gegenereerd: "2026-10-29T10:00:00+01:00" }, now);
assert.deepEqual([oud.items.length, oud.filmpjes.length, oud.dumpert.length, oud.dag_samenvatting], [0, 0, 0, ""]);
console.log("vandaag: geslaagd");
