// Een fotoswipe en een onafhankelijke scroller mogen de voorlaadrichting van de nieuwslijst niet wijzigen.
import assert from "node:assert/strict";
import { act, createElement } from "react";
import { zetNepDom, Knoop } from "../hulp/nepdom";
import fixture from "./fixtures/carrousel-laadfout-625.json";

const { container, doc } = zetNepDom({});
const g = globalThis as any;
const geladen: string[] = [];
g.Image = class { set src(url: string) { if (url) geladen.push(url); } decode() { return Promise.resolve(); } };
g.Node = { DOCUMENT_POSITION_FOLLOWING: 4 };
let meldZichtbaar: (entries: { target: Knoop; isIntersecting: boolean }[]) => void = () => {};
class Observer {
  constructor(cb: typeof meldZichtbaar, opties?: { threshold?: number }) { if (opties?.threshold === 0.01) meldZichtbaar = cb; }
  observe() {} unobserve() {} disconnect() {}
}
g.IntersectionObserver = g.window.IntersectionObserver = Observer;
const lijst: Knoop = doc.createElement("div");
lijst.setAttribute("class", "nf");
lijst.scrollTop = 100;
Object.defineProperty(lijst.classList, "contains", { value: (naam: string) => naam === "nf" });
container.appendChild(lijst);
const maakElement = doc.createElement;
doc.createElement = (naam: string) => { const el: Knoop = maakElement(naam); Object.defineProperty(el, "closest", { value: (selector: string) => selector === ".nf" ? lijst : null }); return el; };
Knoop.prototype.isConnected = true;
let scrollHandler: (e: Event) => void = () => {};
const voegToe = g.window.addEventListener;
g.window.addEventListener = (type: string, handler: (e: Event) => void, opties: unknown) => { if (type === "scroll" && opties && (opties as { capture?: boolean }).capture) scrollHandler = handler; else voegToe(type, handler, opties); };
const { Beelden } = await import("../../src/beelden");
const { createRoot } = await import("react-dom/client");
const roots = Array.from({ length: 8 }, () => { const houder: Knoop = doc.createElement("div"); lijst.appendChild(houder); return createRoot(houder as unknown as Element); });
// Vergelijk de houders van de beeldblokken in documentvolgorde.
Knoop.prototype.compareDocumentPosition = function (ander: Knoop) { return lijst.children.indexOf(this.parentNode!) < lijst.children.indexOf(ander.parentNode!) ? 4 : 2; };
const urls = Array.from({ length: 8 }, (_, i) => `${fixture.urls[0]}?bericht=${i}`);
const oudeFout = console.error;
console.error = (...args: unknown[]) => { if (!args.some((x) => String(x).includes("fetchPriority"))) oudeFout(...args); };
await act(async () => { roots.forEach((root, i) => root.render(createElement(Beelden, { urls: i === 3 ? [urls[i], fixture.urls[1]] : [urls[i]] }))); });
const blokken = lijst.children.map((houder) => houder.children[0]);
const wacht = () => new Promise((resolve) => setTimeout(resolve, 15));
const zichtbaar = async (i: number) => { await act(async () => { meldZichtbaar(blokken.map((target, k) => ({ target, isIntersecting: k === i }))); await wacht(); }); };
const scroll = async (doel: Knoop, top: number) => { doel.scrollTop = top; const e = new Event("scroll"); Object.defineProperty(e, "target", { value: doel }); await act(async () => { scrollHandler(e); await wacht(); }); };
await zichtbaar(3);
assert.ok(geladen.includes(urls[4]), "standaard wordt naar beneden voorgeladen");
await scroll(lijst, 80);
assert.ok(geladen.includes(urls[2]), "omhoog bladeren laadt boven de lijstpositie");
const track = blokken[3].children[0];
// Zonder scrollHeight negeert de oude code elke scroll; zo bewijst de test dat hij de richting wél zou omdraaien.
lijst.scrollHeight = 1000; track.scrollHeight = 300;
const onafhankelijk = new Knoop("div");
onafhankelijk.scrollHeight = 500;
await scroll(track, 0);
await scroll(track, 30);
await scroll(track, 60);
await scroll(onafhankelijk, 0);
await scroll(onafhankelijk, 50);
await zichtbaar(6);
assert.ok(!geladen.includes(urls[7]), "een fotoswipe omlaag draait de richting niet om");
assert.ok(geladen.includes(urls[3]), "de richting blijft omhoog na een fotoswipe en andere scrolls");
await scroll(lijst, 120);
await zichtbaar(4);
assert.ok(geladen.includes(urls[7]), "omlaag bladeren laadt onder de lijstpositie");
await act(async () => roots.forEach((root) => root.unmount()));
console.error = oudeFout;
