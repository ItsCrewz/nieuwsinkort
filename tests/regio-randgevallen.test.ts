import assert from "node:assert/strict";
import { bronSignaal, herindeel, isBuitenland } from "../src/regio";

let n = 0;
const t = (naam: string, fn: () => void) => { fn(); n++; console.log("✓", naam); };
const bron = (href: string) => ({ href });

t("ongeldige en relatieve bron-URL's geven geen signaal", () => {
  for (const href of ["", "geen url", "/buitenland/bericht", "https://"]) {
    assert.equal(bronSignaal(bron(href)), null, href);
  }
});

t("alleen hele padsegmenten geven een bronsignaal", () => {
  for (const pad of ["nieuws/buitenlandbericht", "nieuws/wereldwijd", "nieuws/binnenlandse-zaken", "nieuws/sportief", "nieuws/wereld-politiek"]) {
    assert.equal(bronSignaal(bron(`https://voorbeeld.nl/${pad}`)), null, pad);
  }
  assert.equal(bronSignaal(bron("https://voorbeeld.nl/nieuws/WORLD/bericht")), "buiten");
  assert.equal(bronSignaal(bron("https://voorbeeld.nl/nieuws/politiek/bericht")), "binnen");
  assert.equal(bronSignaal(bron("https://voorbeeld.nl/nieuws/sport/bericht")), "neutraal");
  assert.equal(bronSignaal(bron("https://voorbeeld.nl/nieuws/bericht?sectie=buitenland#world")), null);
});

t("Nederlands anker in kop of samenvatting wint van buitenlandse signalen", () => {
  const bronnen = [bron("https://voorbeeld.nl/buitenland/1"), bron("https://voorbeeld.nl/world/2")];
  assert.equal(isBuitenland({ kop: "Nederland reageert op Trump", bronnen }), false);
  assert.equal(isBuitenland({ kop: "Trump reageert", ai: "Het kabinet spreekt hierover.", bronnen }), false);
});

t("evenveel buiten- en binnensignalen blijven Nederland, ook met landnaam", () => {
  const bronnen = [bron("https://voorbeeld.nl/world/1"), bron("https://voorbeeld.nl/binnenland/2")];
  assert.equal(isBuitenland({ kop: "Trump reageert", bronnen }), false);
  assert.equal(isBuitenland({ kop: "Nieuwsbericht", bronnen: [...bronnen].reverse() }), false);
});

t("Wall Street en Binance vereisen een economiewoord zonder bronsignaal", () => {
  for (const naam of ["Wall Street", "Binance"]) {
    assert.equal(isBuitenland({ kop: `${naam} organiseert een filmavond` }), false, naam);
    assert.equal(isBuitenland({ kop: `${naam} meldt winst` }), true, naam);
    assert.equal(isBuitenland({ kop: `${naam} doet een melding`, ai: "De koers stijgt." }), true, naam);
  }
  assert.equal(isBuitenland({ kop: "De beurs meldt winst" }), false);
});

t("bronsignalen en Nederlands anker gaan voor de economieregel", () => {
  assert.equal(isBuitenland({ kop: "Binance meldt winst", bronnen: [bron("https://voorbeeld.nl/binnenland/1")] }), false);
  assert.equal(isBuitenland({ kop: "Wall Street meldt winst", bronnen: [bron("https://voorbeeld.nl/sport/1")] }), false);
  assert.equal(isBuitenland({ kop: "Nederland onderzoekt Binance en de koers" }), false);
  assert.equal(isBuitenland({ kop: "Binance organiseert filmavond", bronnen: [bron("https://voorbeeld.nl/world/1")] }), true);
});

t("België en Servië herkennen voor leestekens maar niet binnen een woord", () => {
  for (const land of ["België", "Servië"]) {
    for (const leesteken of [".", ",", ":", "!", "?", ")"]) {
      assert.equal(isBuitenland({ kop: `Nieuws uit ${land}${leesteken}` }), true, `${land}${leesteken}`);
    }
    assert.equal(isBuitenland({ kop: `Nieuws uit ${land}achtig` }), false, land);
  }
});

t("herindeel laat andere rubrieken en hun object ongemoeid", () => {
  for (const cat of ["tech", "haarlem", "sport", "buitenland"]) {
    const item = { cat, kop: "Trump meldt nieuws", bronnen: [bron("https://voorbeeld.nl/world/1")] };
    assert.equal(herindeel(item), item, cat);
    assert.equal(item.cat, cat);
  }
  const item = { cat: "nl", kop: "Trump meldt nieuws" };
  assert.equal(herindeel(item).cat, "buitenland");
  assert.equal(item.cat, "nl");
});

console.log(`\n${n} tests geslaagd`);
