import assert from "node:assert/strict";
import { createElement, createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server.browser";
import { Zoekbalk, ZoekFormulier, ZoekLeeg } from "../src/zoekbalk";

const leeg = renderToStaticMarkup(createElement(ZoekLeeg, { query: "niets", onWis: () => {} }));
assert.match(leeg, /Geen berichten gevonden voor ‘niets’/);
assert.match(leeg, /Wis zoekopdracht/);
for (const [aantal, tekst] of [[0, "0 resultaten"], [1, "1 resultaat"], [2, "2 resultaten"]] as const) {
  // Een nieuwe mount simuleert terugkeer uit een bericht met behouden zoekterm.
  const balk = renderToStaticMarkup(createElement(Zoekbalk, { query: "tekst", onChange: () => {}, aantal }));
  assert.match(balk, /aria-expanded="true"/);
  assert.match(balk, /value="tekst"/);
  assert.ok(balk.includes(`aria-live="polite">${tekst}</span>`));
}
const geslotenBalk = renderToStaticMarkup(createElement(Zoekbalk, { query: "", onChange: () => {}, aantal: 0 }));
assert.match(geslotenBalk, /aria-expanded="false"/);
let gesloten = false;
const formulier = ZoekFormulier({ query: "tekst", onChange: () => {}, sluit: () => { gesloten = true; }, invoer: createRef<HTMLInputElement>() });
const invoer = formulier.props.children[0];
assert.equal(invoer.props["aria-label"], "Zoek in het nieuws");
invoer.props.onKeyDown({ key: "Escape", preventDefault() {}, stopPropagation() {} });
assert.equal(gesloten, true);
console.log("zoekbalk: tests geslaagd");

// Zoekscope (#613): rubriek, tijd-, bron- en extra filters worden genoemd, ook bij nul resultaten.
import { STANDAARD } from "../src/filters";
import { scopeZin, zoekScope } from "../src/zoekbalk";
const home = zoekScope("alles", STANDAARD, "vandaag", 2);
assert.equal(home.scope, "Home (zonder Politiek)");
assert.deepEqual(home.beperkt, ["tijdfilter Vandaag", "2 bronnen uit", "Politiek niet inbegrepen"]);
assert.deepEqual(zoekScope("alles", { ...STANDAARD, cats: ["politiek"] }, "alles", 0), { scope: "rubrieken Politiek", beperkt: [] });
assert.equal(zoekScope("voetbal", STANDAARD, "3u", 1).scope, "rubriek Voetbal");
let breed: boolean | null = null;
const kaal = renderToStaticMarkup(createElement(Zoekbalk, { query: "x", onChange: () => {}, aantal: 0, scope: home, onBreed: (b) => { breed = b; } }));
assert.match(kaal, /aria-describedby="zoek-scope"/);
assert.match(kaal, /Zoekt in Home \(zonder Politiek\)\. Beperkt door: tijdfilter Vandaag, 2 bronnen uit/);
assert.match(kaal, /Zoek zonder filters/);
const nul = ZoekLeeg({ query: "x", onWis: () => {}, scope: home, onBreed: (b) => { breed = b; } });
assert.match(renderToStaticMarkup(nul), /Geen berichten gevonden voor ‘x’\. Zoekt in Home.*Zoek zonder filters.*Wis zoekopdracht/);
assert.match(scopeZin(home, true), /zonder filters \(je filterkeuzes blijven staan\)/);
assert.doesNotMatch(renderToStaticMarkup(createElement(ZoekLeeg, { query: "x", onWis: () => {}, scope: home, breed: true, onBreed: () => {} })), /Zoek zonder filters<\/button>/);
void breed;
console.log("zoekscope: tests geslaagd");
