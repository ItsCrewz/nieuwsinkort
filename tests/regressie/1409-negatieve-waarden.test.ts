import assert from "node:assert/strict";
import { markeerDelen, normaliseer, zoekItems } from "../../src/zoek";
import type { Item } from "../../src/types";

const k = (kop: string) => ({ cat: "nl", kop }) as Item;
const vindt = (kop: string, q: string) => zoekItems([k(kop)], q).length === 1;
const gemarkeerd = (t: string, q: string) => markeerDelen(t, q).filter((d) => d.markeer).map((d) => d.tekst).join("|");

assert.ok(vindt("Het wordt -5 graden", "-5"));
assert.ok(vindt("Het wordt −5 graden", "-5") && vindt("Het wordt -5 graden", "−5"));
assert.ok(!vindt("Het wordt +5 graden", "-5") && !vindt("Het wordt 5 graden", "-5"));
assert.ok(vindt("Het wordt 5 graden", "5") && vindt("Het wordt +5 graden", "5"));
assert.ok(!vindt("Het wordt -5 graden", "5"));
assert.ok(vindt("Koers -5,5 procent", "-5,5") && !vindt("Koers -5,5 procent", "-5") && !vindt("Koers 5,5 procent", "-5,5"));
assert.ok(vindt("Min (-5) graden", "-5") && vindt("Verlies -1.000 euro", "-1000"));
// koppeltekens in woorden en bereiken blijven ongewijzigd
assert.ok(vindt("Corona-maatregelen", "coronamaatregelen") && vindt("COVID-19 golf", "covid-19") && vindt("COVID-19 golf", "19"));
assert.ok(vindt("Uitslag 10-5", "5") && vindt("Uitslag 10-5", "10") && !vindt("Uitslag 10-5", "-5"));
// uitsluiten van woorden werkt nog
assert.ok(!vindt("Verkiezing Amerika", "verkiezing -amerika") && vindt("Verkiezing", "verkiezing -amerika"));
assert.equal(normaliseer("a -5 −3"), "a -5 -3");
assert.equal(gemarkeerd("Het wordt -5 en 5 graden", "-5"), "-5");
assert.equal(gemarkeerd("Het wordt -5 en 5 graden", "5"), "5");
console.log("✓ zoeken onderscheidt negatieve van positieve waarden");
