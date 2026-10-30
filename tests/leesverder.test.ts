// Draai: npm run test  (Lees verder-regels en detailinhoud, src/leesverder.ts)
import assert from "node:assert/strict";
import { detailInhoud, heeftLeesVerder } from "../src/leesverder";
import type { Item } from "../src/types";

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log("✓", name); };
const basis: Item = { cat: "nl", kop: "Nieuws", ai: "", tijd: "12:00", bronnen: [] };

t("heeftLeesVerder: true bij alleen meer, ai, samenvatting of punten", () => {
  assert.equal(heeftLeesVerder({ ...basis, meer: "sleutel" }), true);
  assert.equal(heeftLeesVerder({ ...basis, ai: "Kort" }), true);
  assert.equal(heeftLeesVerder({ ...basis, samenvatting: "Lang" }), true);
  assert.equal(heeftLeesVerder({ ...basis, punten: ["Eén"] }), true);
});

t("heeftLeesVerder: false bij leeg item, witruimte of lege punten", () => {
  assert.equal(heeftLeesVerder(basis), false);
  assert.equal(heeftLeesVerder({ ...basis, ai: " \n\t ", samenvatting: "  \n " }), false);
  assert.equal(heeftLeesVerder({ ...basis, punten: [] }), false);
});

t("heeftLeesVerder: ook voor een ruw item", () => {
  assert.equal(heeftLeesVerder({ ...basis, ruw: true }), false);
  assert.equal(heeftLeesVerder({ ...basis, ruw: true, meer: "sleutel" }), true);
  assert.equal(heeftLeesVerder({ ...basis, ruw: true, ai: "Feedtekst" }), true);
});

t("detailInhoud: samenvatting splitst op lege regels en laat witruimte-alinea's vallen", () => {
  const r = detailInhoud({ ...basis, samenvatting: "Eerste.\nNog een regel.\n\nTweede.\n  \n \t\nDerde." });
  assert.deepEqual(r.paragraphs, ["Eerste.\nNog een regel.", "Tweede.", "Derde."]);
  assert.deepEqual(detailInhoud({ ...basis, samenvatting: "  \n\n  " }).paragraphs, []);
});

t("detailInhoud: punten en bronnen ongewijzigd in volgorde", () => {
  const punten = ["C", "A", "B"];
  const bronnen = [{ site: "Z", href: "https://z.nl/1" }, { site: "A", href: "https://a.nl/1" }];
  const r = detailInhoud({ ...basis, punten, bronnen });
  assert.deepEqual(r.punten, punten);
  assert.deepEqual(r.bronnen, bronnen);
});

t("detailInhoud: ontbrekende velden geven lege lijsten", () => {
  const { bronnen: _b, ...zonder } = basis;
  assert.deepEqual(detailInhoud(zonder as Item), { paragraphs: [], punten: [], bronnen: [] });
});

console.log(`${n} tests ok`);
