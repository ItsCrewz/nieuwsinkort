import assert from "node:assert/strict";
import { normaliseer, zoekItems, markeerDelen } from "../src/zoek";
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
const politiek = { cat: "nl", kop: "Politiek debat" } as Item;
const katten = { cat: "nl", kop: "Katten in het asiel", samenvatting: "Zeven kat-vriendelijke acties" } as Item;
assert.deepEqual(zoekItems([politiek, katten], "kat"), [katten]);
assert.deepEqual(zoekItems([politiek], "kat"), []);
assert.deepEqual(zoekItems([politiek, katten], "Pol"), [politiek]);
assert.deepEqual(zoekItems([katten], "kat asiel"), [katten]);
assert.deepEqual(zoekItems([katten], "kat debat"), []);
assert.deepEqual(zoekItems([{ cat: "nl", kop: "Top 100 van 2026" } as Item], "20"), [{ cat: "nl", kop: "Top 100 van 2026" }]);
assert.deepEqual(zoekItems([{ cat: "nl", kop: "Top 100 van 2026" } as Item], "00"), []);
// Koppeltekenvarianten (#811)
const corona = { cat: "nl", kop: "Nieuwe corona-maatregelen", samenvatting: "Het kabinet overlegt" } as Item;
const coronaSamen = { cat: "nl", kop: "Coronamaatregelen verlengd" } as Item;
const verspreid = { cat: "nl", kop: "Corona in het ziekenhuis", samenvatting: "Nieuwe maatregelen volgen" } as Item;
assert.deepEqual(zoekItems([corona, coronaSamen, verspreid], "coronamaatregelen"), [corona, coronaSamen]);
assert.deepEqual(zoekItems([corona, coronaSamen, verspreid], "corona-maatregelen"), [corona, coronaSamen]);
assert.deepEqual(zoekItems([corona, coronaSamen, verspreid], "corona maatregelen"), [corona, verspreid]);
assert.deepEqual(zoekItems([corona, coronaSamen], "coronamaatr"), [corona, coronaSamen]);
assert.deepEqual(zoekItems([corona], "corona-maatregelen kabinet"), [corona]);
assert.deepEqual(zoekItems([corona], "corona-maatregelen ajax"), []);
assert.deepEqual(zoekItems([{ cat: "nl", kop: "Corona", ai: "maatregelen" } as Item], "corona-maatregelen"), []);
assert.deepEqual(zoekItems([{ cat: "nl", kop: "E-mail hack" } as Item], "email"), [{ cat: "nl", kop: "E-mail hack" }]);
assert.deepEqual(zoekItems([{ cat: "nl", kop: "Café-terras" } as Item], "cafeterras"), [{ cat: "nl", kop: "Café-terras" }]);
assert.deepEqual(zoekItems([{ cat: "nl", kop: "Zuid-Holland" } as Item], "holland"), [{ cat: "nl", kop: "Zuid-Holland" }]);
assert.deepEqual(zoekItems([{ cat: "nl", kop: "Zuid Holland" } as Item], "zuidholland"), []);
for (const schrijfwijze of ["Café-terras", "Cafe\u0301-terras"]) {
  const terras = { cat: "nl", kop: schrijfwijze } as Item;
  assert.deepEqual(zoekItems([terras], "cafeterras"), [terras]);
  assert.deepEqual(zoekItems([{ cat: "nl", kop: "cafeterras" } as Item], schrijfwijze).length, 1);
}
for (const leesteken of [",", ";", "/", "(", ")", "."]) {
  assert.deepEqual(zoekItems([corona], `corona-maatregelen${leesteken}kabinet`), [corona]);
  assert.deepEqual(zoekItems([corona], `kabinet${leesteken}corona-maatregelen`), [corona]);
  assert.deepEqual(zoekItems([verspreid], `corona-maatregelen${leesteken}ziekenhuis`), []);
}
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
assert.deepEqual(markeerDelen("Café en cafe\u0301", "cafe"), [{ tekst: "Café", markeer: true }, { tekst: " en ", markeer: false }, { tekst: "cafe\u0301", markeer: true }]);
assert.deepEqual(markeerDelen("Ajax tegen PSV en ajax", "psv AJAX"), [{ tekst: "Ajax", markeer: true }, { tekst: " tegen ", markeer: false }, { tekst: "PSV", markeer: true }, { tekst: " en ", markeer: false }, { tekst: "ajax", markeer: true }]);
assert.deepEqual(markeerDelen("(test)*", "(test)*"), [{ tekst: "(", markeer: false }, { tekst: "test", markeer: true }, { tekst: ")*", markeer: false }]);
assert.deepEqual(markeerDelen("veilig", "(*"), [{ tekst: "veilig", markeer: false }]);
assert.deepEqual(markeerDelen("Debat over Onderwijs in Nederland, de toekomst", "de"), [{ tekst: "De", markeer: true }, { tekst: "bat over Onderwijs in Nederland, ", markeer: false }, { tekst: "de", markeer: true }, { tekst: " toekomst", markeer: false }]);
console.log("zoek: tests geslaagd");
