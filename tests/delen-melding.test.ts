import assert from "node:assert/strict";
import { act, createElement } from "react";
import type { Item } from "../src/types";

// Echte React-render van DeelBlok (#1211) met een minimale nep-DOM (geen jsdom): controleert dat de live region
// hetzelfde element blijft, bij iedere kopieeractie leeg wordt en opnieuw "Link gekopieerd" krijgt, en dat de timer herstart en opruimt.
const g = globalThis as any;
g.MessageChannel = class {
  port1: { onmessage: ((e: { data: unknown }) => void) | null } = { onmessage: null };
  port2 = { postMessage: (data: unknown) => setImmediate(() => this.port1.onmessage?.({ data })) };
};
g.IS_REACT_ACT_ENVIRONMENT = true;

class Knoop {
  nodeType = 1; kinderen: Knoop[] = []; ouder: Knoop | null = null; attrs: Record<string, string> = {}; style: Record<string, string> = {};
  tekst = ""; ownerDocument: any = doc;
  constructor(public nodeName: string, nodeType = 1) { this.nodeType = nodeType; }
  get tagName() { return this.nodeName; }
  get namespaceURI() { return "http://www.w3.org/1999/xhtml"; }
  get firstChild() { return this.kinderen[0] ?? null; }
  get lastChild() { return this.kinderen[this.kinderen.length - 1] ?? null; }
  get nextSibling() { return this.ouder?.kinderen[this.ouder.kinderen.indexOf(this) + 1] ?? null; }
  set textContent(w: string) { this.kinderen = []; if (w) this.appendChild(new Knoop("#text", 3)).tekst = w; }
  get nodeValue() { return this.tekst; } set nodeValue(w: string) { this.tekst = w; }
  get data() { return this.tekst; } set data(w: string) { this.tekst = w; }
  appendChild(k: Knoop) { return this.insertBefore(k, null); }
  insertBefore(k: Knoop, voor: Knoop | null) {
    k.ouder?.removeChild(k);
    const i = voor ? this.kinderen.indexOf(voor) : this.kinderen.length;
    this.kinderen.splice(i < 0 ? this.kinderen.length : i, 0, k); k.ouder = this; return k;
  }
  removeChild(k: Knoop) { const i = this.kinderen.indexOf(k); if (i >= 0) this.kinderen.splice(i, 1); k.ouder = null; return k; }
  setAttribute(n: string, w: string) { this.attrs[n] = String(w); }
  removeAttribute(n: string) { delete this.attrs[n]; }
  addEventListener() {} removeEventListener() {}
  inhoud(): string { return this.nodeType === 3 ? this.tekst : this.kinderen.map((k) => k.inhoud()).join(""); }
  vind(f: (k: Knoop) => boolean): Knoop | null { if (f(this)) return this; for (const k of this.kinderen) { const r = k.vind(f); if (r) return r; } return null; }
}
const doc: any = {
  createElement: (n: string) => new Knoop(n.toUpperCase()), createElementNS: (_ns: string, n: string) => new Knoop(n.toUpperCase()), createTextNode: (t: string) => { const k = new Knoop("#text", 3); k.tekst = t; return k; },
  addEventListener() {}, removeEventListener() {}, body: null,
};
doc.body = new Knoop("BODY");
g.document = doc;
g.window = Object.assign(new EventTarget(), { HTMLIFrameElement: class {} });
doc.defaultView = g.window;
doc.activeElement = null;
doc.documentElement = doc.body;

// Nepklok voor de timer van 3 s
let nu = 0, timerId = 0;
const timers = new Map<number, { op: number; fn: () => void }>();
const echteSet = globalThis.setTimeout, echteClear = globalThis.clearTimeout;
const gaVerder = (ms: number) => act(async () => {
  nu += ms;
  for (const [id, tm] of [...timers]) if (tm.op <= nu) { timers.delete(id); tm.fn(); }
});

const { DeelBlok } = await import("../src/detail");
const { createRoot } = await import("react-dom/client");
const item = { kop: "Testbericht" } as Item;
const url = "https://nieuwsinkort.nl/bericht/test";
const oudeNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
Object.defineProperty(globalThis, "navigator", { configurable: true, value: { clipboard: { writeText: async () => {} } } });

const mount = async () => {
  const wortel = new Knoop("DIV");
  const root = createRoot(wortel as unknown as Element);
  await act(async () => root.render(createElement(DeelBlok, { item, url })));
  const live = () => doc.body.vind((k: Knoop) => k.attrs.role === "status") ?? wortel.vind((k) => k.attrs.role === "status")!;
  const knop = () => (doc.body.vind((k: Knoop) => k.attrs.class === "deel-knop") ?? wortel.vind((k) => k.attrs.class === "deel-knop"))!;
  const klik = async () => {
    const propsSleutel = Object.keys(knop()).find((s) => s.startsWith("__reactProps$"))!;
    await act(async () => { await (knop() as any)[propsSleutel].onClick(); });
  };
  return { live, klik, unmount: () => act(async () => root.unmount()) };
};

// Legt iedere tekstwijziging van de live region vast
const geschiedenis = (el: Knoop) => {
  const h: string[] = [el.inhoud()];
  const oud = Knoop.prototype.insertBefore, oudRemove = Knoop.prototype.removeChild;
  const noteer = () => { const t = el.inhoud(); if (h[h.length - 1] !== t) h.push(t); };
  el.insertBefore = function (k, v) { const r = oud.call(this, k, v); noteer(); return r; };
  el.removeChild = function (k) { const r = oudRemove.call(this, k); noteer(); return r; };
  const tekstSet = Object.getOwnPropertyDescriptor(Knoop.prototype, "textContent")!.set!;
  Object.defineProperty(el, "textContent", { set(w: string) { tekstSet.call(this, w); noteer(); }, configurable: true });
  return { h, noteer };
};

globalThis.setTimeout = ((fn: () => void, ms: number) => { const id = ++timerId; timers.set(id, { op: nu + ms, fn }); return id; }) as unknown as typeof setTimeout;
globalThis.clearTimeout = ((id: number) => { timers.delete(id); }) as unknown as typeof clearTimeout;
try {
  const b = await mount();
  const el = b.live();
  const { h } = geschiedenis(el);
  await b.klik();
  assert.equal(b.live(), el, "live region blijft hetzelfde element");
  assert.equal(el.inhoud(), "Link gekopieerd");
  await gaVerder(2000);
  await b.klik();
  assert.equal(b.live(), el, "live region blijft ook na de tweede actie hetzelfde element");
  assert.equal(el.inhoud(), "Link gekopieerd");
  assert.deepEqual(h, ["", "Link gekopieerd", "", "Link gekopieerd"], "tweede actie maakt de melding eerst leeg en daarna opnieuw zichtbaar");
  await gaVerder(2000); // 4 s na de eerste klik, 2 s na de laatste
  assert.equal(el.inhoud(), "Link gekopieerd", "tweede actie krijgt eigen bevestigingsperiode");
  await gaVerder(1100);
  assert.equal(el.inhoud(), "", "melding verdwijnt 3 s na de laatste actie");

  const c = await mount();
  await c.klik();
  assert.equal(timers.size, 1);
  await c.unmount();
  assert.equal(timers.size, 0, "unmount ruimt de timer op");
  console.log("ok delen-melding");
} finally {
  globalThis.setTimeout = echteSet; globalThis.clearTimeout = echteClear;
  if (oudeNavigator) Object.defineProperty(globalThis, "navigator", oudeNavigator);
  else Reflect.deleteProperty(globalThis, "navigator");
}
