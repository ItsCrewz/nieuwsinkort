// Draai: npm run test. Legt de afspraken uit het desktopontwerp (#1067, fase 1) vast.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log("✓", name); };
const mock = readFileSync("docs/mockups/desktop-nieuwsoverzicht.html", "utf8");
const ontwerp = readFileSync("docs/ontwerp-desktop-nieuwsoverzicht.md", "utf8");

t("ontwerp: desktoplayout begint pas bij min-width 1024px", () => {
  const breedtes = [...mock.matchAll(/min-width:\s*(\d+)px\)/g)].map((m) => m[1]);
  assert.deepEqual(breedtes, ["1024"]);
  assert.match(ontwerp, /min-width: 1024px/);
  assert.match(mock, /@media \(min-width:1024px\)\{[^]*\.desk\{display:block\}/);
  assert.match(mock, /\.desk\{display:none\}/);
});

t("ontwerp: skip-link, landmarks en koppen", () => {
  assert.match(mock, /<a class="skip" href="#inhoud">/);
  assert.match(mock, /<main id="inhoud" tabindex="-1">/);
  for (const l of ["<header>", '<nav aria-label="Rubrieken">', '<aside aria-label="Zijbalk">']) assert.ok(mock.includes(l), l);
  assert.ok(mock.indexOf("class=\"skip\"") < mock.indexOf("<header>"), "skip-link eerst");
  assert.ok(mock.indexOf("<header>") < mock.indexOf("<main"), "header voor main");
  assert.ok(mock.indexOf("<main") < mock.indexOf("<aside"), "sidebar na hoofdinhoud");
});

t("ontwerp: beeldmaat gereserveerd tegen CLS", () => {
  assert.match(mock, /\.beeld\{aspect-ratio:16\/9/);
});

t("ontwerp: mockup is zelfstandig (geen script, geen externe requests)", () => {
  assert.doesNotMatch(mock, /<script|https?:\/\/|<link|@import|src=/i);
});

t("ontwerp: mobiele weergave blijft ongewijzigd in het voorstel", () => {
  assert.match(ontwerp, /Onder 1024px verandert niets/);
});

console.log(`\n${n} tests geslaagd`);
