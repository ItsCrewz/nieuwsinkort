// #1286: de pauzeknop (.ftap) is met het toetsenbord bedienbaar: alleen de actieve slide heeft een tabstop,
// naam en pictogram volgen de echte afspeeltoestand en Enter/spatie op de knop geven precies één wissel.
// De nep-DOM kent geen echte toetsenbordactivatie: die wordt nagebootst met onClick (detail 0, zoals een browser).
import assert from "node:assert/strict";
import { act, createElement } from "react";
import { Knoop, zetNepDom } from "../hulp/nepdom";

const dom = zetNepDom({});
// De feed bepaalt de actieve slide via IntersectionObserver; vang de callback af om een slide in beeld te melden.
const waarnemers: Array<(e: unknown[]) => void> = [];
(globalThis as any).window.IntersectionObserver = (globalThis as any).IntersectionObserver = class {
  constructor(cb: (e: unknown[]) => void) { waarnemers.push(cb); }
  observe() {} unobserve() {} disconnect() {} takeRecords() { return []; }
};
const { createRoot } = await import("react-dom/client");
const { Feed } = await import("../../src/feed");
const lijst = [0, 1].map((n) => ({
  titel: `Filmpje ${n}`, bron: "Test", href: `https://example.com/${n}`, embed: `https://example.com/v${n}.mp4`, thumb: "", ai: "", populariteit: "", tijd: "",
}));
const root = createRoot(dom.container as unknown as Element);
await act(async () => root.render(createElement(Feed, { list: lijst, cat: "filmpjes", start: null, onClose: () => {} })));

const props = (n: Knoop) => (n as any)[Object.keys(n).find((k) => k.startsWith("__reactProps$"))!];
const knoppen = () => dom.doc.body.vind((n: Knoop) => n.nodeName === "button" && (n.getAttribute("class") ?? "") === "ftap");
const toestand = () => knoppen().map((k) => ({ tab: k.getAttribute("tabindex"), naam: k.getAttribute("aria-label"), play: k.vind((n: Knoop) => (n.getAttribute("class") ?? "").includes("fstate")).length }));
const klik = (k: Knoop) => act(async () => { props(k).onClick({ detail: 0, clientX: 0, currentTarget: k }); });
// Toets op de knop: de window-handler moet spatie op een knop negeren (de native klik doet het werk).
const toets = (key: string, doel: Knoop) => {
  const e = Object.assign(new Event("keydown", { cancelable: true }), { key });
  Object.defineProperty(e, "target", { value: doel });
  window.dispatchEvent(e);
  return e.defaultPrevented;
};

assert.equal(knoppen().length, 2, "twee mp4-slides, elk een knop");
let s = toestand();
assert.equal(s[0].tab, "0", "actieve slide is tabbaar");
assert.equal(s[1].tab, "-1", "andere slide niet");
assert.equal(s[0].naam, "Pauzeren");
assert.equal(s[0].play, 0);

// Toetsenbordactivatie (Enter of spatie als klik zonder muispositie): pauzeren en weer hervatten.
const k0 = knoppen()[0];
k0.closest = (sel: string) => (sel.includes("button") ? k0 : null);
await klik(k0);
s = toestand();
assert.equal(s[0].naam, "Afspelen", "naam volgt de pauze");
assert.equal(s[0].play, 1, "play-icoon zichtbaar bij pauze");
await klik(k0);
s = toestand();
assert.equal(s[0].naam, "Pauzeren", "hervat: naam terug");
assert.equal(s[0].play, 0);

// Window-handler: spatie op de knop wordt niet extra getoggeld; Enter wordt niet afgehandeld.
await act(async () => { assert.equal(toets(" ", k0), false, "spatie op knop niet door window afgehandeld"); });
await act(async () => { assert.equal(toets("Enter", k0), false, "Enter niet door window afgehandeld"); });
assert.equal(toestand()[0].naam, "Pauzeren", "geen dubbele toggle via window");
// Spatie buiten een knop pauzeert wel (bestaand gedrag, via de feed zelf).
await act(async () => { toets(" ", dom.doc.body); });
assert.equal(toestand()[0].naam, "Afspelen");
await act(async () => { toets(" ", dom.doc.body); });

// Wisselen naar de volgende video verhuist de tabstop en de naam volgt de nieuwe slide.
const slide1 = dom.doc.body.vind((n: Knoop) => (n.getAttribute("class") ?? "").split(" ").includes("fslide"))[1];
slide1.dataset.i = "1";
slide1.isConnected = true;
await act(async () => { waarnemers.forEach((cb) => cb([{ target: slide1, isConnected: true, isIntersecting: true, intersectionRatio: 1 }])); });
s = toestand();
assert.equal(s[0].tab, "-1");
assert.equal(s[1].tab, "0");
assert.equal(s[0].naam, "Pauzeren", "niet-actieve slide heet nooit Afspelen");
assert.equal(s[1].naam, "Pauzeren");
await act(async () => root.unmount());
console.log("✓ #1286: pauzeknop is met het toetsenbord bedienbaar");
