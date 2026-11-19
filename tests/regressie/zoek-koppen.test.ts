import assert from "node:assert/strict";
import { zoekItems, zoeksuggesties } from "../../src/zoek";
import type { Item } from "../../src/types";

const kop = { cat: "nl", kop: "Café opent na verbouwing", ai: "Nieuws uit de stad" } as Item;
const tekst = { cat: "nl", kop: "Nieuws uit de stad", ai: "Een café opent", bronnen: [{ site: "Cafénieuws" }] } as Item;
assert.deepEqual(zoekItems([kop, tekst], "cafe"), [kop, tekst]);
assert.deepEqual(zoekItems([kop, tekst], "cafe", true), [kop]);
assert.deepEqual(zoekItems([kop, tekst], "cafe -verbouwing", true), []);
assert.deepEqual(zoekItems([kop, tekst], "", true), [kop, tekst]);
const suggestie = { kop: "Verkiezingen", ai: "Nieuws uit Nederland" } as Item;
assert.deepEqual(zoeksuggesties([suggestie], "verkiezngen nederland"), ["Verkiezingen nederland"]);
assert.deepEqual(zoeksuggesties([suggestie], "verkiezngen nederland", true), []);

assert.deepEqual(zoekItems([kop, tekst], "cafe onbekend", "of", true), [kop]);
assert.deepEqual(zoekItems([kop, tekst], "cafe onbekend -verbouwing", "of", true), []);
assert.deepEqual(zoeksuggesties([suggestie], "verkiezngen onbekend", true, "of"), ["Verkiezingen onbekend"]);
