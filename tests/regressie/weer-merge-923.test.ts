import assert from "node:assert/strict";
import { merge } from "../../src/dagdata";

const origineel = Date.now;
Date.now = () => Date.parse("2026-11-04T12:00:00Z");
try {
  const routineWeer = { nu: { temp: 12, omschrijving: "Bewolkt" }, dagen: [{ dag: "Donderdag", max: 13 }], verwachting: "Later regen" };
  const uurWeer = { nu: { temp: 10, omschrijving: "Regen" }, dagen: [{ dag: "Donderdag", max: 11 }], verwachting: "Buien trekken weg" };
  const routine = { gegenereerd: "2026-11-04T09:00:00Z", weer: routineWeer, items: [{ kop: "Routinebericht", bronnen: [{ href: "https://nos.nl/routine" }] }], filmpjes: [{ href: "https://voorbeeld.nl/routine", tijd: "09:00" }], dumpert: [] };
  const uur = { gegenereerd: "2026-11-04T08:00:00Z", weer: uurWeer, items: [{ kop: "Uurbericht", bronnen: [{ href: "https://nos.nl/uur" }] }], filmpjes: [{ href: "https://voorbeeld.nl/uur", tijd: "10:00" }], dumpert: [] };
  for (const [tijd, verwacht] of [["2026-11-04T08:00:00Z", routineWeer], ["2026-11-04T10:00:00Z", uurWeer]] as const) {
    const uit = merge(routine, { ...uur, gegenereerd: tijd });
    assert.deepEqual(uit.weer, verwacht);
    assert.deepEqual(uit.items.map((i: any) => i.kop), ["Uurbericht", "Routinebericht"]);
    assert.deepEqual(uit.filmpjes.map((v: any) => v.href), ["https://voorbeeld.nl/uur", "https://voorbeeld.nl/routine"]);
  }
  for (const ontbreekt of [undefined, null, {}, { dagen: [] }, { dagen: "ongeldig" }]) {
    assert.deepEqual(merge({ ...routine, weer: ontbreekt }, uur).weer, uurWeer);
    assert.deepEqual(merge(routine, { ...uur, gegenereerd: "2026-11-04T10:00:00Z", weer: ontbreekt }).weer, routineWeer);
    assert.equal(merge({ ...routine, weer: ontbreekt }, { ...uur, weer: ontbreekt }).weer, undefined);
  }
  assert.deepEqual(merge(routine, { ...uur, gegenereerd: "2026-11-04T10:00:00Z", weer: { nu: { temp: 10 }, verwachting: "" } }).weer, { nu: { temp: 10 }, verwachting: "" });
} finally {
  Date.now = origineel;
}
console.log("✓ weer: recentste bruikbare gegevens en terugval bij samenvoegen");
