import assert from "node:assert/strict";
import { normaliseer, zoekItems } from "../src/zoek";
import type { Item } from "../src/types";

const item: Item = { cat: "buitenland", kop: "Ajax", ai: "Wedstrijd", samenvatting: "Café bij PSV", punten: ["Supporters"], bronnen: [{ site: "NOS", href: "" }], tijd: "" };
assert.equal(normaliseer("  CAFÉ,  nieuws! "), "cafe nieuws");
for (const term of ["ajax", "wedstrijd", "cafe", "supporters", "nos", "buitenland", "ajax psv", "CAFÉ"]) assert.deepEqual(zoekItems([item], term), [item], term);
assert.deepEqual(zoekItems([item], "ajax onbekend"), []);
const items = [item];
assert.equal(zoekItems(items, "  "), items);
assert.equal(zoekItems(items, ""), items);
assert.deepEqual(zoekItems([{ cat: "nl", kop: "cafe" } as Item], "Café" ).length, 1);
assert.deepEqual(zoekItems([{ cat: "nl", kop: "test" } as Item], "onbekend"), []);
console.log("zoek: tests geslaagd");
