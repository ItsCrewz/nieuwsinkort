import assert from "node:assert/strict";
import { createElement, createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server.browser";
import { Zoekbalk, ZoekFormulier, ZoekLeeg } from "../src/zoekbalk";

const leeg = renderToStaticMarkup(createElement(ZoekLeeg, { query: "niets", onWis: () => {} }));
assert.match(leeg, /Geen berichten gevonden voor ‘niets’/);
assert.match(leeg, /Wis zoekopdracht/);
for (const query of ["!!!", "😀"]) {
  const melding = renderToStaticMarkup(createElement(ZoekLeeg, { query, onWis: () => {} }));
  const balk = renderToStaticMarkup(createElement(Zoekbalk, { query, onChange: () => {}, aantal: 0 }));
  assert.match(melding, /Voer letters of cijfers in om te zoeken/);
  assert.match(balk, /aria-live="polite">Voer letters of cijfers in om te zoeken/);
  assert.doesNotMatch(balk, /resultaten?/);
}
for (const [aantal, tekst] of [[0, "0 resultaten"], [1, "1 resultaat"], [2, "2 resultaten"]] as const) {
  // Een nieuwe mount simuleert terugkeer uit een bericht met behouden zoekterm.
  const balk = renderToStaticMarkup(createElement(Zoekbalk, { query: "tekst", onChange: () => {}, aantal, invoer: createRef<HTMLInputElement>() }));
  assert.match(balk, /aria-expanded="true"/);
  assert.match(balk, /value="tekst"/);
  assert.ok(balk.includes(`aria-live="polite">${tekst}</span>`));
}
const geslotenBalk = renderToStaticMarkup(createElement(Zoekbalk, { query: "", onChange: () => {}, aantal: 0, invoer: createRef<HTMLInputElement>() }));
assert.match(geslotenBalk, /aria-expanded="false"/);
assert.match(geslotenBalk, /aria-label="Zoeken"/);
assert.match(geslotenBalk, /<button type="button" class="zoek-knop"[^>]*><svg[^>]*><use href="#i-search"><\/use><\/svg><\/button>/);
assert.ok(!/>Zoek</.test(geslotenBalk));
let gesloten = false;
const formulier = ZoekFormulier({ query: "tekst", onChange: () => {}, sluit: () => { gesloten = true; }, invoer: createRef<HTMLInputElement>() });
const invoer = formulier.props.children[0];
assert.equal(invoer.props["aria-label"], "Zoek in het nieuws");
invoer.props.onKeyDown({ key: "Escape", preventDefault() {}, stopPropagation() {} });
assert.equal(gesloten, true);
console.log("zoekbalk: tests geslaagd");
