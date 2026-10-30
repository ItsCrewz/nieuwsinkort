import assert from "node:assert/strict";
import { hostVan, isNL } from "../src/bronlink";

let n = 0;
const t = (naam: string, fn: () => void) => {
  fn();
  n++;
  console.log("✓", naam);
};

t("hostVan: haalt de host uit een gewone URL", () => {
  assert.equal(hostVan("https://nos.nl"), "nos.nl");
});

t("hostVan: laat poort, pad en query weg en behoudt www", () => {
  assert.equal(hostVan("https://www.example.nl:8443/nieuws?id=1"), "www.example.nl");
});

t("hostVan: ongeldige en relatieve links geven een lege string", () => {
  for (const href of ["", "rommel", "/nieuws", "www.example.nl/nieuws"]) {
    assert.equal(hostVan(href), "", href);
  }
});

t("isNL: minstens één Nederlandse bron is voldoende", () => {
  assert.equal(isNL({ c: [{ href: "https://example.com" }, { href: "https://www.nos.nl/nieuws" }] }), true);
});

t("isNL: andere hosts en een lege lijst zijn geen Nederlandse bron", () => {
  assert.equal(isNL({ c: [{ href: "https://example.com" }, { href: "https://example.be" }, { href: "https://nos.nl.example.com" }] }), false);
  assert.equal(isNL({ c: [] }), false);
});

t("isNL: ongeldige links tellen niet mee", () => {
  assert.equal(isNL({ c: [{ href: "/nieuws.nl" }, { href: "ongeldig" }] }), false);
  assert.equal(isNL({ c: [{ href: "/nieuws.nl" }, { href: "https://nos.nl" }] }), true);
});

console.log(`\n${n} tests geslaagd`);
