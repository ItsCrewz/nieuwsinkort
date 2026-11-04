import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server.browser";
import { BionicText, FocusSwitch } from "../../src/ui";
import teksten from "./fixtures/joey-focus-507.json";

for (const tekst of teksten) {
  const uit = renderToStaticMarkup(createElement(BionicText, { text: tekst, on: false }));
  const aan = renderToStaticMarkup(createElement(BionicText, { text: tekst, on: true }));
  assert.doesNotMatch(uit, /<b>/, "Focus uit laat de echte tekst zonder vet zien");
  assert.match(aan, /<b>.*?<\/b>/, "Focus aan maakt delen van de echte tekst vet");
}
console.log("Focus-lezen maakt alleen ingeschakeld woorddelen vet");

const knop = renderToStaticMarkup(createElement(FocusSwitch, { value: false, onChange: () => {} }));
assert.match(knop, /class="focus-label">Focus(?:-lezen)?<\/span>/);
assert.match(knop, /aria-label="Focus-lezen"/);
const css = readFileSync("src/index.css", "utf8");
const labelregels = [...css.matchAll(/([^{}]*\.focus-label\b[^{}]*)\{([^{}]*)\}/g)];
for (const [, , inhoud] of labelregels) {
  assert.doesNotMatch(inhoud, /(?:^|;)\s*display\s*:\s*none\b/i, "Het Focus-label blijft ook mobiel zichtbaar");
}
console.log("Focus-label blijft mobiel zichtbaar");
