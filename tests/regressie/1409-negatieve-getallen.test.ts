import assert from "node:assert/strict";
import { markeerDelen, normaliseer, zoekItems } from "../../src/zoek";
import type { Item } from "../../src/types";

// #1409: een minteken direct voor een getal blijft behouden, zodat -5 niet gelijk is aan 5.
const k = (kop: string) => ({ cat: "nl", kop }) as Item;
const vindt = (kop: string, q: string) => zoekItems([k(kop)], q).length === 1;

assert.equal(normaliseer("-5"), "-5");
assert.equal(normaliseer("−5"), "-5");
assert.equal(normaliseer("-2,5 en +3"), "-2.5 en 3");
assert.equal(normaliseer("corona-5 en 2024-5"), "corona 5 en 2024 5");
assert.ok(vindt("Het wordt -5 graden", "-5") && vindt("Het wordt (-5) graden", "-5"));
assert.ok(!vindt("Het wordt 5 graden", "-5") && !vindt("Het wordt +5 graden", "-5"));
assert.ok(vindt("Het wordt 5 graden", "5") && vindt("Het wordt +5 graden", "5"));
assert.ok(!vindt("Het wordt -50 graden", "-5") && !vindt("Het wordt -5 graden", "-50"));
// Unicode-minteken in tekst en zoekterm
assert.ok(vindt("Het wordt −5 graden", "-5") && vindt("Het wordt -5 graden", "−5"));
// Decimalen
assert.ok(vindt("Daling van -2,5 procent", "-2.5") && vindt("Daling van -2.5 procent", "-2,5") && !vindt("Daling van 2,5 procent", "-2,5"));
// Koppeltekens in woorden en bereiken zijn geen negatieve getallen
assert.ok(vindt("Corona-5 maatregelen", "corona-5") && !vindt("Corona-5 maatregelen", "-5"));
assert.ok(!vindt("Periode 2024-5", "-5") && !vindt("Tussen 5-10 graden", "-10"));
assert.ok(vindt("Corona-maatregelen", "coronamaatregelen") && vindt("Reis naar de V-S", "v-s"));
// Uitsluiten blijft met een woord werken
assert.ok(!vindt("Het wordt -5 graden", "-graden") && vindt("Het wordt -5 graden", "-doden"));
// Markeren
const gemarkeerd = (t: string, q: string) => markeerDelen(t, q).filter((x) => x.markeer).map((x) => x.tekst).join("|");
assert.equal(gemarkeerd("Het wordt -5 graden", "-5"), "-5");
assert.equal(gemarkeerd("Het wordt −5 graden", "-5"), "−5");
assert.equal(gemarkeerd("Het wordt -5 graden", "5"), "");
assert.equal(gemarkeerd("Het wordt 5 graden", "-5"), "");
assert.equal(gemarkeerd("Het wordt -50 graden", "-5"), "");
assert.equal(gemarkeerd("Corona-5", "5"), "5");
