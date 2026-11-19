import assert from "node:assert/strict";
import { zoekItems, zoeksuggesties } from "../../src/zoek";
import type { Item } from "../../src/types";

const zichtbaar = [{ kop: "Verkiezingen in Nederland", cat: "nl" }, { kop: "Verkeer in Haarlem", cat: "nl" }] as Item[];
const verborgen = { kop: "Verkiezingen in Frankrijk", cat: "buitenland" } as Item;
assert.deepEqual(zoekItems(zichtbaar, "verkiezngen nederland"), []);
assert.deepEqual(zoeksuggesties(zichtbaar, "verkiezngen nederland"), ["Verkiezingen nederland"]);
assert.deepEqual(zoeksuggesties(zichtbaar, "verkiezingen frankrjik"), []);
assert.deepEqual(zoeksuggesties([...zichtbaar, verborgen], "verkiezingen frankrjik"), ["verkiezingen Frankrijk"]);
assert.deepEqual(zoeksuggesties(zichtbaar, "verk"), []);
assert.deepEqual(zoeksuggesties(zichtbaar, "verkiezngen -nederland"), []);
assert.deepEqual(zoeksuggesties(zichtbaar, "x".repeat(10000)), []);
assert.ok(zoeksuggesties(Array.from({ length: 20 }, (_, i) => ({ kop: `Verkiezinge${String.fromCharCode(97 + i)}` } as Item)), "verkiezingen").length <= 3);

// Korte termen mogen ook bij veel koppen geen koppen verwerken.
const veelItems = Array.from({ length: 1000 }, () => ({ get kop(): string { throw new Error("Kop onnodig gelezen"); } } as Item));
assert.deepEqual(zoeksuggesties(veelItems, "verk"), []);
