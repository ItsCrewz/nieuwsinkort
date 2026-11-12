import assert from "node:assert/strict";
import { zoekItems } from "../../src/zoek";
import type { Item } from "../../src/types";

const aaneen = { cat: "nl", kop: "Café De Kroon opent weer", ai: "De burgemeester bezoekt het café." } as Item;
const verspreid = { cat: "nl", kop: "Café opent weer bij de Kroon", ai: "De burgemeester komt langs." } as Item;
const velden = { cat: "nl", kop: "Café De", ai: "Kroon opent weer" } as Item;
const langer = { cat: "nl", kop: "Café De Kroonstad opent weer" } as Item;
const berichten = [aaneen, verspreid, velden, langer];

assert.deepEqual(zoekItems(berichten, '"CAFE de kroon"'), [aaneen]);
assert.deepEqual(zoekItems(berichten, '"cafe de kroon" burgemeester'), [aaneen]);
assert.deepEqual(zoekItems(berichten, 'burgemeester "cafe de kroon"'), [aaneen]);
assert.deepEqual(zoekItems(berichten, '"cafe de kroon" onbekend'), []);
assert.deepEqual(zoekItems(berichten, '"cafe de kroon" "opent weer"'), [aaneen]);
assert.deepEqual(zoekItems(berichten, '"cafe de kroon" cafe'), [aaneen]);
assert.deepEqual(zoekItems([aaneen], '"cafe de kroon" kroon'), []);
assert.deepEqual(zoekItems(berichten, '"cafe kroon'), berichten);
assert.deepEqual(zoekItems(berichten, 'cafe kroon'), berichten);
