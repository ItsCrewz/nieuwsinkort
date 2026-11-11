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
assert.deepEqual(zoekItems([{ cat: "nl", kop: "Top 100 van 2026" } as Item], "20"), []);
assert.deepEqual(zoekItems([{ cat: "nl", kop: "Top 20 van 2026" } as Item], "20"), [{ cat: "nl", kop: "Top 20 van 2026" }]);
assert.deepEqual(zoekItems([{ cat: "nl", kop: "Top 100 van 2026" } as Item], "00"), []);
const jaar = (kop: string) => ({ cat: "nl", kop } as Item);
const [j24, j240, j12024] = [jaar("Verkiezingen 2024"), jaar("Prijs 20240 euro"), jaar("Code 12024")];
assert.deepEqual(zoekItems([j24, j240, j12024], "2024"), [j24]);
assert.deepEqual(zoekItems([j24, j240], "20240"), [j240]);
const cafe2024 = jaar("Café 2024, groot");
assert.deepEqual(zoekItems([cafe2024, jaar("Café 20240")], "2024 CAFÉ"), [cafe2024]);
assert.deepEqual(zoekItems([jaar("Verkiezingen in 2024")], "2024 verkie").length, 1);
assert.deepEqual(zoekItems([jaar("Groei 2024.")], "2024").length, 1);
const [decimaal, langerDecimaal, nulDecimaal] = [jaar("Temperatuur 3,5 graden"), jaar("Temperatuur 3,55 graden"), jaar("Temperatuur 3,50 graden")];
assert.deepEqual(zoekItems([decimaal, langerDecimaal, nulDecimaal], "3,5"), [decimaal]);
const kop = (k: string) => ({ cat: "nl", kop: k }) as Item;
const markt = kop("Drukte op de markt"), beide = kop("Mark bezoekt de markt"), brand = kop("Brand bij brand");
assert.deepEqual(zoekItems([markt, beide], "mark markt"), [beide]);
assert.deepEqual(zoekItems([markt, beide], "markt mark"), [beide]);
assert.deepEqual(zoekItems([markt, brand, kop("Een brand")], "brand brand"), [brand]);
const brandAfkorting = kop("Brand o.a. in Gent"), marktAfkorting = kop("Markt in de V.S.");
assert.deepEqual(zoekItems([brandAfkorting], "brand brand"), []);
assert.deepEqual(zoekItems([marktAfkorting], "mark markt"), []);
assert.deepEqual(zoekItems([brandAfkorting], "brand oa"), [brandAfkorting]);
assert.deepEqual(zoekItems([marktAfkorting], "markt vs"), [marktAfkorting]);
assert.deepEqual(zoekItems([marktAfkorting], "vs v.s."), []);
// korte term die op meerdere woorden past: volgorde van termen maakt niet uit
const mar = kop("Markt en Maria");
for (const q of ["mar maria", "maria mar", "mar markt", "markt mar"]) assert.deepEqual(zoekItems([mar], q), [mar], q);
assert.deepEqual(zoekItems([mar], "mar mar mar"), []);
assert.deepEqual(zoekItems([{ cat: "nl", kop: "Café", ai: "café-eigenaar" } as Item], "cafe cafe"), [{ cat: "nl", kop: "Café", ai: "café-eigenaar" }]);
const talen = ["C++", "C#", "C", "Cursus café"].map((kop) => ({ cat: "tech", kop }) as Item);
for (const [term, verwacht] of [["C++", 0], ["c#", 1], ["C", 2]] as const) {
  assert.deepEqual(zoekItems(talen.slice(0, 3), term), [talen[verwacht]], term);
}
assert.deepEqual(zoekItems(talen, "curs cafe"), [talen[3]]);
assert.deepEqual(zoekItems([{ cat: "tech", kop: "Nieuws over C++, en C#." } as Item], "C++ C#").length, 1);
assert.equal(normaliseer("C++/C#; café-nieuws"), "c++ c# cafe nieuws");
assert.equal(normaliseer("+++ ###"), "");
assert.deepEqual(zoekItems([talen[0]], "C++ C++"), []);
assert.deepEqual(zoekItems([{ cat: "tech", kop: "C++ en C++" } as Item], "C++ C++").length, 1);
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
