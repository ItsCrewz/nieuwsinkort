import assert from "node:assert/strict";
import { markeerDelen, zoekItems } from "../../src/zoek";
import type { Item } from "../../src/types";

const lig = { cat: "nl", kop: "Het ﬁle en de ﬂuit in het oﬃce" } as Item;
const gewoon = { cat: "nl", kop: "Het file en de fluit in het office" } as Item;
// Beide richtingen: gewone term vindt ligatuur, ligatuurterm vindt gewone tekst.
for (const term of ["file", "fluit", "office", "ﬁle", "ﬂuit", "oﬃce", "ﬁle fluit", "FILE"]) {
  assert.deepEqual(zoekItems([lig, gewoon], term), [lig, gewoon], term);
}
// Woordbegin blijft gelden en een ander woord past niet.
for (const term of ["ile", "fire", "ﬁre", "ﬁle brand"]) assert.deepEqual(zoekItems([lig, gewoon], term), [], term);
assert.deepEqual(markeerDelen("ﬁle", "file"), [{ tekst: "ﬁle", markeer: true }]);
assert.deepEqual(markeerDelen("file", "ﬁle"), [{ tekst: "file", markeer: true }]);
assert.deepEqual(markeerDelen("De ﬁle", "fi"), [{ tekst: "De ", markeer: false }, { tekst: "ﬁ", markeer: true }, { tekst: "le", markeer: false }]);
// Ligatuur telt als twee letters voor de koppeltekenregel: "ﬁ-le" is net zo gekoppeld als "fi-le".
const kopLig = { cat: "nl", kop: "Het ﬁ-le en oﬃ-ce" } as Item;
const kopGewoon = { cat: "nl", kop: "Het fi-le en offi-ce" } as Item;
for (const term of ["file", "ﬁle", "office", "oﬃce"]) assert.deepEqual(zoekItems([kopLig, kopGewoon], term), [kopLig, kopGewoon], term);
assert.deepEqual(zoekItems([kopLig, kopGewoon], "ile"), []);
