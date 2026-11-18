import assert from "node:assert/strict";
import { kostenGelijk, ontdubbelVerhalen } from "../../src/verhaaldubbel";

// #1206: "1,5 ton" werd als "5 ton" gelezen
const T = Date.UTC(2026, 0, 5, 12);
const v = (kop: string, tekst = "advocaatkosten") => ({ kop, tekst, tijd: T });
const item = (kop: string, ai: string, t = T) => ({ kop, ai: `${ai} advocaatkosten`, samenvatting: "advocaatkosten", t });
let fouten = 0;
const t = (naam: string, f: () => void) => { try { f(); } catch (e) { console.error(naam, e); fouten++; } };
t("1,5 ton is gelijk aan 150.000 euro", () => {
  assert.equal(kostenGelijk(v("Borsato claimt 1,5 ton kosten"), v("Borsato claimt 150.000 euro kosten")), true);
});
t("1,5 ton is niet 5 ton", () => {
  assert.equal(kostenGelijk(v("Borsato claimt 1,5 ton kosten"), v("Borsato claimt 5 ton kosten")), false);
});
t("dubbelzinnig bedrag geeft false", () => {
  assert.equal(kostenGelijk(v("Borsato claimt 1.5 ton kosten"), v("Borsato claimt 150.000 euro kosten")), false);
  assert.equal(kostenGelijk(v("Borsato claimt 1.5 ton kosten"), v("Borsato claimt 1.5 ton kosten")), false);
});
t("woordgetal en geheel bedrag blijven werken", () => {
  assert.equal(kostenGelijk(v("Borsato claimt vier ton kosten"), v("Borsato claimt 400.000 euro kosten")), true);
});
const kop = (b: string) => `Marco Borsato claimt ${b} kosten van de staat terug`;
t("ontdubbelVerhalen: 1,5 ton tegen 150.000 euro is één verhaal", () => {
  assert.equal(ontdubbelVerhalen([item(kop("1,5 ton"), "Marco Borsato"), item(kop("150.000 euro"), "Marco Borsato", T + 60e3)]).length, 1);
});
t("ontdubbelVerhalen: 1,5 ton tegen 5 ton blijft twee", () => {
  assert.equal(ontdubbelVerhalen([item(kop("1,5 ton"), "Marco Borsato"), item(kop("5 ton"), "Marco Borsato", T + 60e3)]).length, 2);
});
t("ontdubbelVerhalen: dubbelzinnig bedrag blijft twee", () => {
  assert.equal(ontdubbelVerhalen([item(kop("1.5 ton"), "Marco Borsato"), item(kop("150.000 euro"), "Marco Borsato", T + 60e3)]).length, 2);
});
assert.equal(fouten, 0, "kostenbedrag decimaal 1206");
