import assert from "node:assert/strict";
import { cluster, type Cand } from "../worker/src/cluster";
import { herindeelSport, sportCat } from "../worker/src/sportcat";

let n = 0;
const t = (naam: string, fn: () => void) => { fn(); n++; console.log("✓", naam); };
const check = (cat: string, kop: string, hrefs: string[] = []) => sportCat({ cat, kop, hrefs });
const kandidaat = (cat: string, t: string, href: string, d: number): Cand => ({ cat, t, href, d, s: "", site: "test" });
const tijd = 1793350000000;

t("F1 gaat boven voetbal en auto bij meerdere titelsignalen", () => {
  assert.equal(check("nl", "Ajax en Verstappen testen Tesla en BMW"), "f1");
  assert.equal(check("auto", "Ajax en Verstappen testen Tesla en BMW"), "f1");
});

t("bronpaden en titelsignalen volgen dezelfde prioriteit", () => {
  assert.equal(check("tech", "Ajax test Tesla", ["https://voorbeeld.nl/auto/bericht", "https://voorbeeld.nl/formule-1/bericht"]), "f1");
  assert.equal(check("nl", "Verstappen test een auto", ["https://voorbeeld.nl/voetbal/bericht"]), "f1");
  assert.equal(check("buitenland", "Tesla en BMW presenteren modellen", ["https://voorbeeld.nl/voetbal/bericht"]), "voetbal");
  assert.equal(check("nl", "Ajax test een auto", ["https://voorbeeld.nl/auto/bericht"]), "voetbal");
});

t("verkeersongelukken blijven buiten auto, ook bij een autopad of meerdere automerken", () => {
  for (const kop of ["Tesla en BMW botsing op kruispunt", "Auto ongeluk op de snelweg", "Politie meldt gewond na crash met Toyota"]) {
    assert.equal(check("nl", kop, ["https://voorbeeld.nl/auto/bericht"]), null, kop);
  }
});

t("F1 en voetbal gaan ook boven de uitzondering voor verkeersongelukken", () => {
  assert.equal(check("nl", "Verstappen betrokken bij crash met Tesla", ["https://voorbeeld.nl/auto/bericht"]), "f1");
  assert.equal(check("nl", "Ajax betrokken bij ongeluk met auto", ["https://voorbeeld.nl/auto/bericht"]), "voetbal");
});

t("autobron zonder nieuw signaal of met verkeersongeluk behoudt auto", () => {
  for (const kop of ["Ferrari presenteert een nieuw model", "Auto ongeluk op de snelweg"]) {
    assert.equal(check("auto", kop), null);
    const k = { cat: "auto", c: [{ t: kop, href: "https://voorbeeld.nl/nieuws/bericht" }] };
    herindeelSport(k);
    assert.equal(k.cat, "auto");
  }
});

t("politiek, haarlem en showbizz blijven bij sterke signalen in hun rubriek", () => {
  for (const cat of ["politiek", "haarlem", "showbizz"]) {
    const kop = "Verstappen en Ajax testen Tesla en BMW";
    const href = "https://voorbeeld.nl/formule-1/bericht";
    assert.equal(check(cat, kop, [href]), null, cat);
    const k = { cat, c: [{ t: kop, href }] };
    herindeelSport(k);
    assert.equal(k.cat, cat);
  }
});

t("cluster uit verschillende bronrubrieken krijgt F1 boven voetbal en auto", () => {
  const kop = "Verstappen wint grote race in Mexico";
  const groepen = cluster([
    kandidaat("nl", kop, "https://voorbeeld.nl/nieuws/1", tijd),
    kandidaat("auto", kop, "https://voorbeeld.nl/auto/2", tijd + 1000),
    kandidaat("voetbal", kop, "https://voorbeeld.nl/voetbal/3", tijd + 2000),
    kandidaat("f1", kop, "https://voorbeeld.nl/formule-1/4", tijd + 3000),
  ]);
  assert.equal(groepen.length, 1);
  assert.equal(groepen[0].c.length, 4);
  assert.equal(groepen[0].cat, "f1");
  herindeelSport(groepen[0]);
  assert.equal(groepen[0].cat, "f1");
});

t("cluster gebruikt ook het bronpad van een later lid voor herindeling", () => {
  const kop = "Grote wedstrijd eindigt met bijzondere overwinning";
  const groepen = cluster([
    kandidaat("nl", kop, "https://voorbeeld.nl/nieuws/1", tijd),
    kandidaat("tech", kop, "https://voorbeeld.nl/voetbal/2", tijd + 1000),
  ]);
  assert.equal(groepen.length, 1);
  assert.equal(groepen[0].c.length, 2);
  assert.equal(groepen[0].cat, "nl");
  herindeelSport(groepen[0]);
  assert.equal(groepen[0].cat, "voetbal");
});

console.log(`${n} tests ok`);