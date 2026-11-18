import assert from "node:assert/strict";
import { zoekItems, markeerDelen } from "../../src/zoek";
import type { Item } from "../../src/types";

const it = (kop: string) => ({ kop, cat: "nl" }) as unknown as Item;
const vind = (kopppen: string[], q: string) => zoekItems(kopppen.map(it), q).map((i) => i.kop);

// Met en zonder ampersand vinden elkaar.
for (const [tekst, ...zoek] of [["AT&T verhoogt prijzen", "ATT", "AT&T", "at&t", "att"], ["H&M opent winkel", "HM", "H&M"], ["R&D budget stijgt", "RD", "R&D"], ["Q&A over de begroting", "QA", "Q&A"], ["ATT bericht", "AT&T"]]) {
  for (const q of zoek) assert.deepEqual(vind([tekst], q), [tekst], `${q} → ${tekst}`);
}
// Gewone woordgrenzen blijven gelden en uitsluiten werkt.
assert.deepEqual(vind(["AT&T verhoogt prijzen"], "at t"), ["AT&T verhoogt prijzen"]);
assert.deepEqual(vind(["De at een t-shirt"], "AT&T"), []);
assert.deepEqual(vind(["Natte voeten"], "ATT"), []);
assert.deepEqual(vind(["AT&T nieuws", "Ander nieuws"], "nieuws -at&t"), ["Ander nieuws"]);
// Geen samenvoeging bij spaties of lange delen.
assert.deepEqual(vind(["Rock & Roll festival"], "RockRoll"), []);
assert.deepEqual(vind(["Tom&Jerry film"], "TomJerry"), []);
assert.deepEqual(vind(["Nieuws & Co"], "NieuwsCo"), []);
// Bestaand gedrag voor programmeertalen en woordgroepen.
assert.deepEqual(vind(["C++ en C# worden populair"], "c++"), ["C++ en C# worden populair"]);
assert.deepEqual(vind(["C# nieuws", "C nieuws"], "c#"), ["C# nieuws"]);
assert.deepEqual(vind(["De rode fiets"], "\"rode fiets\""), ["De rode fiets"]);
// Markeren.
assert.deepEqual(markeerDelen("Bel AT&T nu", "AT&T").filter((d) => d.markeer).map((d) => d.tekst), ["AT&T"]);
assert.deepEqual(markeerDelen("Bel ATT nu", "AT&T").filter((d) => d.markeer).map((d) => d.tekst), ["ATT"]);
