// Regressietest #1263: breedtewijzigingen behouden de geselecteerde foto.
import assert from "node:assert/strict";
import { act, createElement } from "react";
import { Beelden } from "../../src/beelden";
import fixture from "./fixtures/carrousel-laadfout-625.json";

const g = globalThis as any;
g.IS_REACT_ACT_ENVIRONMENT = true;
g.MessageChannel = class {
  port1 = { onmessage: null as null | ((e: { data: unknown }) => void) };
  port2 = { postMessage: (data: unknown) => setImmediate(() => this.port1.onmessage?.({ data })) };
};
g.requestAnimationFrame = (f: () => void) => setTimeout(f, 0);
g.cancelAnimationFrame = (n: number) => clearTimeout(n);
g.Image = class { decode() { return Promise.resolve(); } }; // preloadBeeld
let wijzigBreedte: () => void;
class TestResizeObserver {
  constructor(callback: () => void) { wijzigBreedte = callback; }
  observe() {}
  disconnect() {}
}
g.ResizeObserver = TestResizeObserver;
const oudeFout = console.error;
console.error = (...a: unknown[]) => { if (!a.some((x) => String(x).includes("fetchPriority"))) oudeFout(...a); }; // bekende React 18-waarschuwing
class Knoop {
  namespaceURI = "http://www.w3.org/1999/xhtml";
  parentNode: Knoop | null = null;
  children: Knoop[] = [];
  attrs: Record<string, string> = {};
  textContent = "";
  nodeName: string;
  tagName: string;
  clientWidth = 0;
  private positie = 0;
  private animatie: ReturnType<typeof setTimeout> | undefined;
  get scrollLeft() { return this.positie; }
  set scrollLeft(v: number) { clearTimeout(this.animatie); this.positie = v; }
  scrolls: number[] = [];
  style = {};
  constructor(naam: string, public ownerDocument: any, public nodeType = 1) { this.nodeName = this.tagName = naam.toUpperCase(); }
  appendChild(n: Knoop) { n.parentNode = this; this.children.push(n); return n; }
  removeChild(n: Knoop) { this.children.splice(this.children.indexOf(n), 1); n.parentNode = null; return n; }
  insertBefore(n: Knoop, voor: Knoop) { n.parentNode = this; this.children.splice(this.children.indexOf(voor), 0, n); return n; }
  setAttribute(k: string, v: string) { this.attrs[k] = String(v); }
  getAttribute(k: string) { return k in this.attrs ? this.attrs[k] : null; }
  removeAttribute(k: string) { delete this.attrs[k]; }
  addEventListener() {}
  removeEventListener() {}
  contains(n: Knoop | null): boolean { return !!n && (n === this || this.children.some((c) => c.contains(n))); }
  focus() {}
  scrollTo(o: { left: number }) {
    this.scrolls.push(o.left);
    clearTimeout(this.animatie);
    this.animatie = setTimeout(() => { this.positie = o.left; props(this)?.onScroll?.(); }, 10);
  }
  getBoundingClientRect() { return { left: 0, width: 100 }; }
  get nodeValue() { return this.textContent; } // React werkt tekstknopen zo bij
  set nodeValue(v: string) { this.textContent = v; }
  get classList() { return { add: () => {} }; }
}
const doc: any = { activeElement: null, addEventListener() {}, removeEventListener() {}, createElement: (n: string) => new Knoop(n, doc), createTextNode: (t: string) => { const k = new Knoop("#text", doc, 3); k.textContent = t; return k; } };
g.window = Object.assign(new EventTarget(), { HTMLIFrameElement: class {}, document: doc });
g.document = doc;
const { createRoot } = await import("react-dom/client");

const tekst = (n: Knoop): string => (n.nodeType === 3 ? n.textContent : n.children.map(tekst).join(""));
const vind = (n: Knoop, f: (k: Knoop) => boolean): Knoop[] => [...(f(n) ? [n] : []), ...n.children.flatMap((c) => vind(c, f))];
const props = (n: Knoop) => (n as any)[Object.keys(n).find((k) => k.startsWith("__reactProps$"))!];
const klasse = (n: Knoop) => n.attrs.class ?? "";

const urls = fixture.urls;

async function toon(lijst: string[]) {
  const houder = new Knoop("div", doc);
  const root = createRoot(houder as unknown as Element);
  const render = (l: string[]) => act(async () => root.render(createElement(Beelden, { urls: l, eager: true })));
  await render(lijst);
  const track = () => vind(houder, (k) => klasse(k) === "bl-track")[0];
  return {
    houder, track, root, render,
    teller: () => vind(houder, (k) => k.attrs["aria-live"] === "polite").map(tekst)[0],
    stippen: () => vind(houder, (k) => klasse(k) === "bl-dots")[0]?.children.map(klasse) ?? [],
    zichtbaar: () => vind(houder, (k) => klasse(k) === "bl-slide" && k.attrs["aria-hidden"] === undefined).map((s) => s.children[0]?.attrs.src),
    scrollNaar: async (n: number, wacht = true) => {
      track().clientWidth = 100;
      track().scrollLeft = n * 100;
      await act(async () => { props(track()).onScroll(); if (wacht) await new Promise((r) => setTimeout(r, 5)); });
    },
    knop: (naam: string) => vind(houder, (k) => k.attrs["aria-label"] === naam)[0],
  };
}

for (const reduced of [false, true]) {
  g.window.matchMedia = () => ({ matches: reduced, addEventListener() {}, removeEventListener() {} });
  const c = await toon(urls);
  // Eerste meting, daarna een foto selecteren door te scrollen.
  c.track().clientWidth = 100;
  wijzigBreedte!();
  await c.scrollNaar(1);
  assert.equal(c.teller(), "Foto 2 van 3");
  for (const breedte of [180, 0, 80]) {
    c.track().clientWidth = breedte;
    // Een scrollgebeurtenis kan al vóór de ResizeObserver binnenkomen.
    await act(async () => { props(c.track()).onScroll(); wijzigBreedte!(); await new Promise((r) => setTimeout(r, 5)); });
    if (breedte) assert.equal(c.track().scrollLeft, breedte);
    assert.equal(c.teller(), "Foto 2 van 3");
    assert.deepEqual(c.stippen(), ["", "on", ""]);
    assert.deepEqual(c.zichtbaar(), [urls[1]]);
    assert.equal(c.track().scrolls.length, 0, "geen navigatieactie bij breedtewijziging");
  }
  await act(async () => props(c.knop("Volgende foto")).onClick({ stopPropagation() {}, preventDefault() {} }));
  assert.equal(c.track().scrolls.at(-1), 160);
  await act(async () => c.root.unmount());
}
console.error = oudeFout;
console.log("Beelden: breedtewijziging (#1263) geslaagd");
