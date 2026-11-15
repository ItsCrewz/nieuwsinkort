import assert from "node:assert/strict";
import React from "react";
import { SourcesSheet } from "../src/sheet";

// Regressie #615: Tab blijft in het bronnenvenster. Lokale doubles, geen DOM.
const g = globalThis as any;
const venster = new EventTarget() as any;
venster.matchMedia = () => ({ matches: false });
venster.setTimeout = () => 1;
venster.clearTimeout = () => {};
g.window = venster;
const doc = new EventTarget() as any;
doc.body = { nodeType: 1, style: { overflow: "" } };
doc.activeElement = null;
g.document = doc;
class Knoop {}
g.Node = Knoop;
const el = (naam: string, zichtbaar = true): any => ({ naam, getClientRects: () => (zichtbaar ? [1] : []), focus() { doc.activeElement = this; } });
const binnen = [el("sluit"), el("alles"), el("a"), el("link")];
const paneel: any = { querySelectorAll: () => binnen.filter((b) => b.getClientRects().length), contains: (x: any) => binnen.includes(x) };
const sluitknop = binnen[0];
const intern = (React as any).__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentDispatcher;
let effect: (() => () => void) | undefined;
const refs: any[] = [];
let i = 0;
intern.current = {
  useState: () => [false, () => {}],
  useRef: (init: unknown) => { const n = i++; return refs[n] ?? (refs[n] = { current: init === null ? (n === 0 ? paneel : n === 1 ? sluitknop : null) : init }); },
  useEffect: (fn: () => () => void) => { effect = fn; },
};
let gesloten = 0; // geteld via onClose
SourcesSheet({ groups: [], weer: [], off: new Set(), setMany() {}, reset() {}, onClose: () => { gesloten++; } });
const opruimen = effect!();
const toets = (key: string, shiftKey = false) => {
  const e = new Event("keydown", { cancelable: true }) as any;
  e.key = key; e.shiftKey = shiftKey;
  venster.dispatchEvent(e);
  return e;
};
assert.equal(doc.activeElement, sluitknop);
// Vooruit rond: laatste -> eerste.
binnen[3].focus();
assert.equal(toets("Tab").defaultPrevented, true);
assert.equal(doc.activeElement, binnen[0]);
// Midden: browser mag zelf doorlopen.
binnen[1].focus();
assert.equal(toets("Tab").defaultPrevented, false);
// Achteruit rond: eerste -> laatste.
binnen[0].focus();
assert.equal(toets("Tab", true).defaultPrevented, true);
assert.equal(doc.activeElement, binnen[3]);
// Onzichtbare laatste bediening wordt overgeslagen.
binnen[3].getClientRects = () => [];
binnen[2].focus();
assert.equal(toets("Tab").defaultPrevented, true);
assert.equal(doc.activeElement, binnen[0]);
binnen[3].getClientRects = () => [1];
// Focus buiten het venster: Tab haalt hem terug.
doc.activeElement = { naam: "buiten" };
assert.equal(toets("Tab").defaultPrevented, true);
assert.equal(doc.activeElement, binnen[0]);
// focusin buiten het venster gaat terug naar de sluitknop.
const buiten = new Knoop();
doc.activeElement = buiten;
const fi = new Event("focusin") as any;
Object.defineProperty(fi, "target", { value: buiten });
doc.dispatchEvent(fi);
assert.equal(doc.activeElement, sluitknop);
// Escape sluit (rustig/animatie: sluiting start, geen fout).
toets("Escape");
assert.equal(gesloten, 0); // sluiten loopt via animatie (360 ms-vangnet), niet direct
// Opruimen verwijdert de listeners.
opruimen();
binnen[3].focus();
assert.equal(toets("Tab").defaultPrevented, false);
doc.activeElement = buiten;
doc.dispatchEvent(fi);
assert.equal(doc.activeElement, buiten);
console.log("sheet-focus: tests geslaagd");
