import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cluster } from "../../worker/src/cluster";

const fx = JSON.parse(readFileSync("tests/fixtures/joey/dubbel-509.json", "utf8"));
const echt = fx.feyenoord[0];
const wedstrijden = [
  { cat: echt.cat, site: echt.bronnen[0].site, href: echt.bronnen[0].href, t: echt.kop, s: `${echt.ai} ${echt.samenvatting}`, d: 1 },
  { cat: "voetbal", site: "NOS", href: "https://nos.nl/b", t: "Ajax verliest van Barcelona in Champions League", s: "Ajax verliest van Barcelona in de Champions League.", d: 2 },
  { cat: "voetbal", site: "RTL", href: "https://rtl.nl/c", t: "Feyenoord verliest ruim van Internazionale en Ajax verliest van Barcelona in Champions League", s: "Feyenoord verliest van Internazionale en Ajax verliest van Barcelona.", d: 3 },
];
assert.ok(cluster(wedstrijden).length >= 2, "Overzicht verbindt twee wedstrijden niet via verhaalregel");
const borsato = fx.borsato[0];
const kosten = [
  { cat: borsato.cat, site: borsato.bronnen[0].site, href: borsato.bronnen[0].href, t: borsato.kop, s: `${borsato.ai} ${borsato.samenvatting}`, d: 1 },
  { cat: "nl", site: "NOS", href: "https://nos.nl/kosten", t: "Marco Borsato eist 450.000 euro terug wegens recente zakelijke uitgaven bij langdurige procedure", s: "Het gaat om advocaatkosten.", d: 2 },
  { cat: "nl", site: "AD", href: "https://ad.nl/kosten", t: "Marco Borsato vraagt 420.000 euro terug", s: "Het gaat om advocaatkosten.", d: 3 },
];
assert.equal(cluster(kosten).length, 2, "Kostenclaim verbindt verschillende bedragen niet via verhaalregel");
