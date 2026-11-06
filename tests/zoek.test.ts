import assert from "node:assert/strict";
import { normaliseer, zoekItems, markeerDelen } from "../src/zoek";
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
const politiek = { cat: "nl", kop: "Politiek debat" } as Item;
const katten = { cat: "nl", kop: "Katten in het asiel", samenvatting: "Zeven kat-vriendelijke acties" } as Item;
assert.deepEqual(zoekItems([politiek, katten], "kat"), [katten]);
assert.deepEqual(zoekItems([politiek], "kat"), []);
assert.deepEqual(zoekItems([politiek, katten], "Pol"), [politiek]);
assert.deepEqual(zoekItems([katten], "kat asiel"), [katten]);
assert.deepEqual(zoekItems([katten], "kat debat"), []);
assert.deepEqual(zoekItems([{ cat: "nl", kop: "Top 100 van 2026" } as Item], "20"), [{ cat: "nl", kop: "Top 100 van 2026" }]);
assert.deepEqual(zoekItems([{ cat: "nl", kop: "Top 100 van 2026" } as Item], "00"), []);
console.log("zoek: tests geslaagd");

assert.deepEqual(markeerDelen("Café en cafe\u0301", "cafe"), [{ tekst: "Café", markeer: true }, { tekst: " en ", markeer: false }, { tekst: "cafe\u0301", markeer: true }]);
assert.deepEqual(markeerDelen("Ajax tegen PSV en ajax", "psv AJAX"), [{ tekst: "Ajax", markeer: true }, { tekst: " tegen ", markeer: false }, { tekst: "PSV", markeer: true }, { tekst: " en ", markeer: false }, { tekst: "ajax", markeer: true }]);
assert.deepEqual(markeerDelen("(test)*", "(test)*"), [{ tekst: "(", markeer: false }, { tekst: "test", markeer: true }, { tekst: ")*", markeer: false }]);
assert.deepEqual(markeerDelen("veilig", "(*"), [{ tekst: "veilig", markeer: false }]);
