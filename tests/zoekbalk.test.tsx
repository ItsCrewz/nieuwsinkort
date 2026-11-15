import assert from "node:assert/strict";
import React, { createElement, createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server.browser";
import { scopeTekst, verborgenTekst } from "../src/zoek";
import { Zoekbalk, ZoekFormulier, ZoekLeeg } from "../src/zoekbalk";

const leeg = renderToStaticMarkup(createElement(ZoekLeeg, { query: "niets", onWis: () => {} }));
assert.match(leeg, /Niets gevonden voor “niets”/);
assert.match(leeg, /Wis zoekopdracht/);
assert.match(renderToStaticMarkup(createElement(ZoekLeeg, { query: "C++", onWis: () => {} })), /Niets gevonden voor “C\+\+”/);
for (const query of ["!!!", "😀"]) {
  const melding = renderToStaticMarkup(createElement(ZoekLeeg, { query, onWis: () => {} }));
  const balk = renderToStaticMarkup(createElement(Zoekbalk, { query, onChange: () => {}, aantal: 0, invoer: createRef<HTMLInputElement>() }));
  assert.match(melding, /Voer letters of cijfers in om te zoeken/);
  assert.match(balk, /aria-live="polite">Voer letters of cijfers in om te zoeken/);
  assert.doesNotMatch(balk, /resultaten?/);
}
for (const aantal of [0, 1, 2]) {
  // Een nieuwe mount simuleert terugkeer uit een bericht met behouden zoekterm.
  const balk = renderToStaticMarkup(createElement(Zoekbalk, { query: "tekst", onChange: () => {}, aantal, invoer: createRef<HTMLInputElement>() }));
  assert.match(balk, /aria-expanded="true"/);
  assert.match(balk, /value="tekst"/);
  assert.ok(balk.includes(`aria-live="polite"></span>`));
}
// Zoekscope (#613): zichtbaar, gekoppeld aan het veld, en filters wissen vanuit de zoekinterface.
{
  let gewist = 0;
  const scope = { tekst: scopeTekst({ rubriek: "Home", zonderPolitiek: true, tijd: "Vandaag", bronnenUit: 3 }), verborgen: 2, wisFilters: () => { gewist++; } };
  assert.equal(scope.tekst, "Zoekt in Home (zonder Politiek) · Vandaag · 3 bronnen uit");
  const balk = renderToStaticMarkup(createElement(Zoekbalk, { query: "tekst", onChange: () => {}, aantal: 0, invoer: createRef<HTMLInputElement>(), scope }));
  assert.match(balk, /aria-describedby="zoek-scope"/);
  assert.match(balk, /id="zoek-scope"[^>]*><span>Zoekt in Home \(zonder Politiek\) · Vandaag · 3 bronnen uit · 2 treffers verborgen door filters<\/span><button[^>]*>Wis filters<\/button>/);
  const zonder = renderToStaticMarkup(createElement(Zoekbalk, { query: "", onChange: () => {}, aantal: 0, invoer: createRef<HTMLInputElement>(), scope: { tekst: scope.tekst, verborgen: 0 } }));
  assert.doesNotMatch(zonder, /Wis filters|verborgen/);
  const leegMet = renderToStaticMarkup(createElement(ZoekLeeg, { query: "niets", onWis: () => {}, verborgen: 1, onWisFilters: scope.wisFilters }));
  assert.match(leegMet, /Niets gevonden voor “niets” · 1 treffer verborgen door filters/);
  assert.match(leegMet, /Wis filters en zoek opnieuw/);
  assert.doesNotMatch(renderToStaticMarkup(createElement(ZoekLeeg, { query: "niets", onWis: () => {} })), /verborgen|Wis filters/);
  assert.equal(verborgenTekst(1), "1 treffer verborgen door filters");
  assert.equal(scopeTekst({ rubriek: "Sport", zonderPolitiek: false, tijd: "Alles", bronnenUit: 0 }), "Zoekt in Sport · Alles");
  assert.equal(gewist, 0);
}
const geslotenBalk = renderToStaticMarkup(createElement(Zoekbalk, { query: "", onChange: () => {}, aantal: 0, invoer: createRef<HTMLInputElement>() }));
assert.match(geslotenBalk, /aria-expanded="false"/);
assert.match(geslotenBalk, /aria-label="Zoeken"/);
assert.match(geslotenBalk, /<button type="button" class="zoek-knop"[^>]*><svg[^>]*><use href="#i-search"><\/use><\/svg><\/button>/);
assert.ok(!/>Zoek</.test(geslotenBalk));
// De dispatcher maakt de compositieref beschikbaar zonder browser-DOM.
const dispatcher = (React as any).__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentDispatcher;
const vorige = dispatcher.current;
dispatcher.current = { useRef: (waarde: boolean) => ({ current: waarde }) };
try {
  let gesloten = 0;
  let geblurd = 0;
  const ref = createRef<HTMLInputElement>();
  (ref as { current: unknown }).current = { blur: () => { geblurd++; } };
  const formulier = ZoekFormulier({ query: "東京", onChange: () => {}, sluit: () => { gesloten++; }, invoer: ref });
  const veld = formulier.props.children[0];
  const knop = formulier.props.children[1];
  assert.equal(veld.props["aria-label"], "Zoek in het nieuws");
  const toets = (key: string, isComposing = false, keyCode = 0) => {
    let verhinderd = false;
    veld.props.onKeyDown({ key, nativeEvent: { isComposing, keyCode }, preventDefault() { verhinderd = true; }, stopPropagation() {} });
    return verhinderd;
  };
  veld.props.onCompositionStart();
  assert.equal(toets("Enter"), true);
  formulier.props.onSubmit({ preventDefault() {} });
  assert.equal(geblurd, 0);
  veld.props.onCompositionEnd();
  assert.equal(toets("Enter", false, 229), true);
  assert.equal(toets("Enter", true), true);
  assert.equal(toets("Enter"), false);
  formulier.props.onSubmit({ preventDefault() {} });
  assert.equal(geblurd, 0);
  const venster = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: { matchMedia: () => ({ matches: true }) } });
  try {
    veld.props.onCompositionStart();
    formulier.props.onSubmit({ preventDefault() {} });
    assert.equal(geblurd, 0);
    veld.props.onCompositionEnd();
    formulier.props.onSubmit({ preventDefault() {} });
    assert.equal(geblurd, 1);
  } finally {
    if (venster) Object.defineProperty(globalThis, "window", venster);
    else Reflect.deleteProperty(globalThis, "window");
  }
  veld.props.onCompositionStart();
  veld.props.onBlur();
  assert.equal(toets("Enter"), false);
  assert.equal(toets("Escape"), true);
  knop.props.onClick();
  assert.equal(gesloten, 2);
} finally {
  dispatcher.current = vorige;
}
console.log("zoekbalk: tests geslaagd");
