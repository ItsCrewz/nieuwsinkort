import assert from "node:assert/strict";
import { normaliseer, zoekItems } from "../src/zoek";
import type { Item } from "../src/types";

const item: Item = { cat: "buitenland", kop: "Ajax", ai: "Wedstrijd", samenvatting: "Café bij PSV", punten: ["Supporters"], bronnen: [{ site: "NOS", href: "" }], tijd: "" };
assert.equal(normaliseer("  CAFÉ,  nieuws! "), "cafe nieuws");
assert.equal(normaliseer("Straße STRAẞE"), "strasse strasse");
for (const term of ["ajax", "wedstrijd", "cafe", "supporters", "nos", "buitenland", "ajax psv", "CAFÉ"]) assert.deepEqual(zoekItems([item], term), [item], term);
assert.deepEqual(zoekItems([item], "ajax onbekend"), []);
const items = [item];
assert.equal(zoekItems(items, "  "), items);
assert.equal(zoekItems(items, ""), items);
for (const term of ["!!!", "😀", " ! 😀 "]) assert.deepEqual(zoekItems(items, term), []);
assert.deepEqual(zoekItems(items, "!!!CAFÉ 😀"), [item]);
assert.deepEqual(zoekItems([{ cat: "nl", kop: "cafe" } as Item], "Café" ).length, 1);
assert.deepEqual(zoekItems([{ cat: "nl", kop: "test" } as Item], "onbekend"), []);
const veranderlijk: Item = { ...item, punten: ["oud punt"], bronnen: [{ site: "Oude bron", href: "" }] };
assert.deepEqual(zoekItems([veranderlijk], "oude bron"), [veranderlijk]);
veranderlijk.bronnen![0].site = "Nieuwe bron";
assert.deepEqual(zoekItems([veranderlijk], "oude bron"), []);
assert.deepEqual(zoekItems([veranderlijk], "nieuwe bron"), [veranderlijk]);
veranderlijk.punten![0] = "nieuw punt";
assert.deepEqual(zoekItems([veranderlijk], "nieuw punt"), [veranderlijk]);
veranderlijk.kop = "Gewijzigde kop";
assert.deepEqual(zoekItems([veranderlijk], "gewijzigde kop"), [veranderlijk]);
assert.deepEqual(zoekItems([{ ...veranderlijk, kop: "Verse data" }], "verse data" ).length, 1);
const politiek = { cat: "nl", kop: "Politiek debat" } as Item;
const katten = { cat: "nl", kop: "Katten in het asiel", samenvatting: "Zeven kat-vriendelijke acties" } as Item;
assert.deepEqual(zoekItems([politiek, katten], "kat"), [katten]);
assert.deepEqual(zoekItems([politiek], "kat"), []);
assert.deepEqual(zoekItems([politiek, katten], "Pol"), [politiek]);
assert.deepEqual(zoekItems([katten], "kat asiel"), [katten]);
assert.deepEqual(zoekItems([katten], "kat debat"), []);
assert.deepEqual(zoekItems([{ cat: "nl", kop: "Top 100 van 2026" } as Item], "20"), [{ cat: "nl", kop: "Top 100 van 2026" }]);
assert.deepEqual(zoekItems([{ cat: "nl", kop: "Top 100 van 2026" } as Item], "00"), []);
// Lettervarianten (#735): zoekterm en tekst, ongeacht hoofdletters.
const soren = { cat: "nl", kop: "Søren Kierkegaard herdacht", samenvatting: "Lech Wałęsa en Łukasz bij Æbleskiver-feest" } as Item;
for (const term of ["Soren", "SØREN", "søren", "lukasz", "ŁUKASZ", "walesa", "Wałęsa", "aebleskiver", "Æbleskiver", "soren kierkegaard"]) assert.deepEqual(zoekItems([soren], term), [soren], term);
for (const term of ["sren", "oren", "ukasz", "bleskiver", "soren jansen"]) assert.deepEqual(zoekItems([soren], term), [], term);
assert.equal(normaliseer("Ørsted ŁÓDŹ Æon"), "orsted lodz aeon");
// De klinkertekens onderscheiden woorden en blijven bij canonieke normalisatie behouden.
for (const [eerste, tweede] of [["कल", "काल"], ["عَلَم", "عِلْم"]]) {
  const artikelen = [eerste, tweede].map((kop) => ({ cat: "nl", kop } as Item));
  assert.notEqual(normaliseer(eerste), normaliseer(tweede));
  assert.deepEqual(zoekItems(artikelen, eerste), [artikelen[0]]);
  assert.deepEqual(zoekItems(artikelen, tweede), [artikelen[1]]);
}
assert.equal(normaliseer("José"), normaliseer("Jose\u0301"));
// Minder normalisatiewerk (#663): eerste zoekactie N + 1, daarna 1 per toetsaanslag, 2 na wijziging van één bericht.
{
  const N = 50;
  const lijst: Item[] = Array.from({ length: N }, (_, i) => ({ cat: "nl", kop: `Kop ${i} café`, ai: `Uitleg ${i}`, bronnen: [{ site: "NOS", href: "" }] }) as Item);
  const orig = String.prototype.normalize;
  let n = 0;
  String.prototype.normalize = function (this: string, ...a: []) { n++; return orig.apply(this, a); };
  try {
    zoekItems(lijst, "k"); assert.equal(n, N + 1);
    n = 0; zoekItems(lijst, "ko"); assert.equal(n, 1);
    n = 0; zoekItems(lijst, "kop"); assert.equal(n, 1);
    lijst[3].kop = "Nieuwe kop";
    n = 0; zoekItems(lijst, "kop"); assert.equal(n, 2);
  } finally { String.prototype.normalize = orig; }
}
console.log("zoek: tests geslaagd");
