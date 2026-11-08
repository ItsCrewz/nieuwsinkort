import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { zelfdeVerhaal } from "../../src/verhaaldubbel";
import { cluster } from "../../worker/src/cluster";

const fx = JSON.parse(readFileSync("tests/fixtures/joey/dubbel-509.json", "utf8"));
const echt = fx.borsato[0];
const verhaal = { kop: echt.kop, tekst: `${echt.ai} ${echt.samenvatting}`, tijd: echt.t };
const gevallen = [
  { naam: "Achtergrondkosten zijn geen hoofdclaim", kop: "Marco Borsato terug op podium na hoge advocaatkosten", tekst: "De advocaatkosten bedroegen 390.000 euro." },
  { naam: "Andere rechtszaak blijft apart", kop: "Marco Borsato vraagt vier ton advocaatkosten terug in rechtszaak tegen platenmaatschappij", tekst: "Het gaat om een andere rechtszaak tegen zijn platenmaatschappij." },
];
let fouten = 0;
for (const g of gevallen) {
  try { assert.equal(zelfdeVerhaal(verhaal, { ...g, tijd: echt.t }), false, g.naam); }
  catch (e) { console.error(e); fouten++; }
}
const kosten = [
  { cat: echt.cat, site: echt.bronnen[0].site, href: echt.bronnen[0].href, t: echt.kop, s: `${echt.ai} ${echt.samenvatting}` },
  { cat: "nl", site: "NOS", href: "https://nos.nl/kosten", t: "Marco Borsato eist 450.000 euro terug wegens recente zakelijke uitgaven bij langdurige procedure", s: "Het gaat om advocaatkosten." },
  { cat: "nl", site: "AD", href: "https://ad.nl/kosten", t: "Marco Borsato vraagt 420.000 euro terug", s: "Het gaat om advocaatkosten." },
];
for (const volgorde of [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]]) {
  try { assert.equal(cluster(volgorde.map((i, d) => ({ ...kosten[i], d: d + 1 }))).length, 2, `Kostenbrug in volgorde ${volgorde.join("-")}`); }
  catch (e) { console.error(e); fouten++; }
}
assert.equal(fouten, 0, "Kostenclaims en kostenbrug blijven gescheiden");
