// Draai: npm run test  (rubriekindeling Nederland / Buitenland, src/regio.ts)
import assert from "node:assert/strict";
import { bronSignaal, herindeel, isBuitenland } from "../src/regio";

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log("✓", name); };
const b = (href: string, buitenFeed?: boolean) => ({ href, buitenFeed });

t("NOS-link zonder sectie met buitenFeed is buitenland", () => {
  assert.equal(isBuitenland({ kop: "Storm in Florida", ai: "", bronnen: [b("https://nos.nl/l/2500001", true)] }), true);
});
t("ad.nl/buitenland/ is buitenland", () => {
  assert.equal(isBuitenland({ kop: "Brand in een fabriek", ai: "Veel gewonden.", bronnen: [b("https://www.ad.nl/buitenland/brand~a1/")] }), true);
});
t("telegraaf /binnenland/ blijft nl", () => {
  assert.equal(isBuitenland({ kop: "Ongeluk op de A2", ai: "", bronnen: [b("https://www.telegraaf.nl/nieuws/binnenland/123/ongeluk")] }), false);
});
t("cluster 2x buiten en 0 binnen is buitenland; 1 buiten en 2 binnen blijft nl", () => {
  assert.equal(isBuitenland({ kop: "Aardbeving", bronnen: [b("https://a.nl/buitenland/1"), b("https://b.nl/world/2")] }), true);
  assert.equal(isBuitenland({ kop: "Aardbeving", bronnen: [b("https://a.nl/buitenland/1"), b("https://b.nl/binnenland/2"), b("https://c.nl/regio/3")] }), false);
});
t("NL-anker wint van buitenlandse bronnen", () => {
  const it = { kop: "Zelensky op bezoek in Nederland", ai: "", bronnen: [b("https://a.nl/buitenland/1"), b("https://b.nl/buitenland/2")] };
  assert.equal(isBuitenland(it), false);
  assert.equal(herindeel({ cat: "nl", ...it }).cat, "nl");
});
t("sport (neutraal) beslist niet op landnaam", () => {
  assert.equal(isBuitenland({ kop: "Verstappen wint GP van Mexico", ai: "", bronnen: [b("https://www.nu.nl/sport/123/verstappen")] }), false);
});
t("zonder signaal beslist het woord", () => {
  assert.equal(isBuitenland({ kop: "Trump kondigt nieuwe heffingen aan", ai: "", bronnen: [b("https://x.nl/nieuws/1")] }), true);
  assert.equal(isBuitenland({ kop: "Gemeente plaatst nieuwe bankjes", ai: "", bronnen: [b("https://x.nl/nieuws/2")] }), false);
});
t("ongeldige href gooit niet", () => {
  assert.equal(bronSignaal(b("geen url")), null);
  assert.equal(bronSignaal(b("")), null);
  assert.equal(isBuitenland({ kop: "Trump", bronnen: [b("/relatief/pad")] }), true);
  assert.equal(isBuitenland({}), false);
});
t("bronSignaal: buitenFeed, buiten, binnen, neutraal, geen", () => {
  assert.equal(bronSignaal(b("https://nos.nl/l/1", true)), "buiten");
  assert.equal(bronSignaal(b("https://nrc.nl/nieuws/2026/verkiezingen-vs/x")), "buiten");
  assert.equal(bronSignaal(b("https://nu.nl/politiek/1/x")), "binnen");
  assert.equal(bronSignaal(b("https://nu.nl/voetbal/1/x")), "neutraal");
  assert.equal(bronSignaal(b("https://nu.nl/economie/1/x")), null);
});
t("bronSignaal: slug-substring geeft geen signaal, alleen een heel padsegment", () => {
  assert.equal(bronSignaal(b("https://www.ad.nl/binnenland/nederland-groeit-door-buitenlandse-migratie~a1/")), "binnen");
  assert.equal(bronSignaal(b("https://www.telegraaf.nl/financieel/wereldwijde-chiptekort/1.html")), null);
  assert.equal(bronSignaal(b("https://x.nl/nieuws/nederland-groeit-snel/1")), null);
  assert.equal(bronSignaal(b("https://x.nl/nieuws/sportief-succes/1")), null);
  assert.equal(bronSignaal(b("https://www.nu.nl/verkiezingen-vs/6/x.html")), "buiten");
  assert.equal(bronSignaal(b("https://www.nu.nl/midden-oosten/6/x.html")), "buiten");
  assert.equal(bronSignaal(b("https://x.nl/spanningen-oekraine/1")), "buiten");
  assert.equal(bronSignaal(b("https://x.nl/oorlog-in-oekraine/1")), "buiten");
  assert.equal(bronSignaal(b("https://x.nl/nederland/1")), null);
  assert.equal(bronSignaal(b("https://x.nl/podcast/1")), null);
});
t("podcast zegt niets over land: de woordenlijst beslist", () => {
  const bron = [b("https://www.telegraaf.nl/podcast/123/republikeinen-in-paniek")];
  assert.equal(isBuitenland({ kop: "Republikeinen vrezen verlies", ai: "", bronnen: bron }), true);
  assert.equal(isBuitenland({ kop: "Gemeente plaatst bankjes", ai: "", bronnen: bron }), false);
});
t("BUITEN_WOORD: nieuwe eigennamen, hoofdlettergevoelig, ë-eindes", () => {
  for (const kop of ["Likoed van Netanyahu wint", "Australische vrouw vast", "Noord-Korea test raket", "Kim Jong-un wil drones", "Documenten in Servië", "Servische premier treedt af", "Egyptische president op bezoek", "Pakistaanse legerleider", "Aziatische beurzen dalen", "Democraten zoeken kiezers", "Kremlin reageert", "Hamas laat gijzelaars vrij", "Hezbollah beschoten", "Houthi-rebellen vallen aan", "Verkiezingen in België"]) {
    assert.equal(isBuitenland({ kop, bronnen: [b("https://x.nl/nieuws/1")] }), true, kop);
  }
  for (const kop of ["Service van NS verbetert", "Azijn terug in de schappen", "De democraten in de raad", "NAVO-top in Den Haag", "Zonder landnaam"]) {
    assert.equal(isBuitenland({ kop, bronnen: [b("https://x.nl/nieuws/1")] }), false, kop);
  }
});
t("herindeel raakt alleen nl aan", () => {
  for (const cat of ["tech", "haarlem", "politiek", "showbizz"]) {
    const it = { cat, kop: "Trump en Poetin", ai: "", bronnen: [b("https://x.nl/buitenland/1", true)] };
    assert.equal(herindeel(it), it);
  }
  const nl = { cat: "nl", kop: "Trump en Poetin", ai: "", bronnen: [b("https://x.nl/buitenland/1")] };
  assert.equal(herindeel(nl).cat, "buitenland");
  assert.equal(nl.cat, "nl");
});

console.log(`\n${n} tests geslaagd`);
