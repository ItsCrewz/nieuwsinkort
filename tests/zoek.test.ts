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
const berichten = [
  { cat: "nl", kop: "Café De Zon opent", ai: "Bewoners vieren feest", punten: ["Gemeente Haarlem steunt initiatief"] },
  { cat: "nl", kop: "Café opent in de zon", ai: "Bewoners vieren feest in Haarlem" },
  { cat: "nl", kop: "Café De", ai: "Zon opent in Haarlem" },
] as Item[];
assert.deepEqual(zoekItems(berichten, '"cafe de zon" haarlem'), [berichten[0]]);
assert.deepEqual(zoekItems(berichten, '"CAFE DE ZON" "gemeente haarlem"'), [berichten[0]]);
assert.deepEqual(zoekItems(berichten, '"cafe de zon" onbekend'), []);
assert.deepEqual(zoekItems(berichten, '"cafe de zon'), berichten);
assert.deepEqual(zoekItems(berichten, '""'), berichten);
assert.deepEqual(zoekItems(berichten, '"de zon"'), [berichten[0], berichten[1]]);
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
