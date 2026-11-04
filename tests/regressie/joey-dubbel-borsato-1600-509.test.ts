import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ontdubbelVerhalen, zelfdeVerhaal } from "../../src/verhaaldubbel";

// Live feed 16:00: dezelfde kostenclaim in twee formuleringen ("vraagt ... terug" / "claimen ... kosten") bleef dubbel
const fx = JSON.parse(readFileSync("tests/fixtures/joey/dubbel-borsato-1600-509.json", "utf8"));
const [a, b] = fx.borsato;
const v = (i: any) => ({ kop: i.kop, tekst: `${i.ai} ${i.samenvatting}`, tijd: i.t });
let fouten = 0;
const t = (naam: string, f: () => void) => { try { f(); } catch (e) { console.error(naam, e); fouten++; } };
t("Borsato 16:00: vier ton, twee formuleringen = één verhaal", () => {
  assert.equal(zelfdeVerhaal(v(a), v(b)), true);
  assert.equal(zelfdeVerhaal(v(b), v(a)), true);
  assert.equal(ontdubbelVerhalen([a, b]).length, 1);
});
t("Borsato 16:00: ander bedrag blijft apart", () => {
  assert.equal(zelfdeVerhaal(v(a), { kop: "Advocaten claimen 450.000 euro kosten voor Borsato", tekst: "advocaatkosten", tijd: a.t }), false);
});
t("Borsato 16:00: kosten als achtergrond blijft apart", () => {
  assert.equal(zelfdeVerhaal(v(a), { kop: "Borsato wil terug op podium na hoge kosten", tekst: "Advocaten vragen vier ton", tijd: a.t }), false);
});
assert.equal(fouten, 0, "Borsato 16:00");
