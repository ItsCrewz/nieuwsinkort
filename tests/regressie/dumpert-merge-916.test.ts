import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { merge } from "../../src/dagdata";

// Bestaande opname van data.json; alleen de Dumpert-items zijn nodig.
const opname = JSON.parse(readFileSync("tests/fixtures/filmpjes-live-31-10.json", "utf8"));
const [nieuw, bestaand, ander] = opname.dumpert;
const data = (gegenereerd: string, dumpert: any[]) => ({ gegenereerd, items: [], filmpjes: [], dumpert });
const oudNu = Date.now;
try {
  Date.now = () => Date.parse("2026-10-31T12:30:00Z");
  const dag = data("2026-10-31T11:00:00Z", [bestaand, ander]);
  const dubbel = { ...bestaand, href: bestaand.href.replace("www.", "") + "?utm_source=test" };
  for (let aantal = 1; aantal <= 4; aantal++) {
    const uur = data("2026-10-31T12:00:00Z", [nieuw, dubbel, nieuw, null].slice(0, aantal));
    assert.deepEqual(merge(dag, uur).dumpert.map((v: any) => v.href), [nieuw.href, aantal >= 2 ? dubbel.href : bestaand.href, ander.href]);
  }
  assert.deepEqual(merge(dag, data("2026-10-31T12:00:00Z", [])).dumpert, dag.dumpert);
  assert.deepEqual(merge(dag, data("2026-10-31T10:00:00Z", [dubbel, nieuw])).dumpert.map((v: any) => v.href), [bestaand.href, ander.href, nieuw.href]);
  assert.deepEqual(merge(dag, data("2026-10-30T12:00:00Z", [])).dumpert, dag.dumpert);
  const veel = Array.from({ length: 30 }, (_, i) => ({ ...nieuw, href: `https://www.dumpert.nl/item/${i}` }));
  assert.equal(merge(dag, data("2026-10-31T12:00:00Z", veel)).dumpert.length, 25);

  Date.now = () => Date.parse("2026-11-01T06:00:00Z");
  const gisteren = { ...bestaand, t: Date.parse("2026-10-31T22:00:00Z") };
  const vandaag = { ...nieuw, t: Date.parse("2026-11-01T05:00:00Z") };
  const vroegeDag = data("2026-11-01T05:30:00Z", [gisteren]);
  assert.deepEqual(merge(vroegeDag, data("2026-11-01T06:00:00Z", [])).dumpert, [{ ...gisteren, gisteren: true }]);
  assert.deepEqual(merge(vroegeDag, data("2026-11-01T06:00:00Z", [vandaag])).dumpert, [vandaag]);
  Date.now = () => Date.parse("2026-11-01T09:00:00Z");
  assert.deepEqual(merge(vroegeDag, data("2026-11-01T08:59:00Z", [])).dumpert, []);
} finally { Date.now = oudNu; }
