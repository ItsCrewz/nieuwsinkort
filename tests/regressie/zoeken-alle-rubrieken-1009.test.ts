import assert from "node:assert/strict";
import { zelfdeZoekselectie, zoekItems, type Zoekselectie } from "../../src/zoek";
import type { Item } from "../../src/types";

const binnen = { cat: "nl", kop: "Nieuws over verkeer" } as Item;
const buiten = { cat: "sport", kop: "Sport en verkeer" } as Item;
const selectie: Zoekselectie = { term: "sport", rubriek: "nl", filters: {}, bronnen: new Set() };
const resultaten = (actie: Zoekselectie | null, huidig: Zoekselectie) =>
  zoekItems(zelfdeZoekselectie(actie, huidig) ? [binnen, buiten] : [binnen], huidig.term);

assert.deepEqual(resultaten(null, selectie), []);
assert.deepEqual(resultaten(selectie, selectie), [buiten]);
assert.deepEqual(resultaten(null, selectie), []); // herstel van de eerdere selectie
assert.deepEqual(resultaten(selectie, { ...selectie, term: "verkeer" }), [binnen]);
assert.deepEqual(resultaten(selectie, { ...selectie, filters: {} }), []);
assert.deepEqual(resultaten(selectie, { ...selectie, bronnen: new Set() }), []);
assert.deepEqual(resultaten(selectie, { ...selectie, rubriek: "sport" }), []);
