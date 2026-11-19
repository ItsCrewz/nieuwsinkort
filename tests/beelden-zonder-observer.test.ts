// #1266: lange lijst Beelden-kaarten zonder IntersectionObserver: er worden maar een handvol <img>'s met src geplaatst,
// met en zonder databesparing, en de zichtbare kaart laadt na scrollen. Simulatie op componentniveau (nagebootste DOM,
// gestubde getBoundingClientRect); geen meting van echte netwerkverzoeken in een browser.
import assert from "node:assert/strict";
import { setMaxListeners } from "node:events";
import { act, createElement } from "react";
import { Beelden } from "../src/beelden";

const g = globalThis as any;
g.IS_REACT_ACT_ENVIRONMENT = true;
g.MessageChannel = class {
  port1 = { onmessage: null as null | ((e: { data: unknown }) => void) };
  port2 = { postMessage: (data: unknown) => setImmediate(() => this.port1.onmessage?.({ data })) };
};
const KAART = 400, VH = 800, AANTAL = 200;
let scrollY = 0;
class NodeMock {
  nodeType: number;
  nodeName: string;
  tagName: string;
  namespaceURI = "http://www.w3.org/1999/xhtml";
  ownerDocument: any;
  parentNode: NodeMock | null = null;
  children: NodeMock[] = [];
  textContent = "";
  style = {};
  attrs: Record<string, string> = {};
  constructor(naam: string, document: any, type = 1) { this.nodeName = naam.toUpperCase(); this.tagName = this.nodeName; this.ownerDocument = document; this.nodeType = type; }
  appendChild(n: NodeMock) { n.parentNode = this; this.children.push(n); return n; }
  removeChild(n: NodeMock) { this.children.splice(this.children.indexOf(n), 1); n.parentNode = null; return n; }
  insertBefore(n: NodeMock, voor: NodeMock) { n.parentNode = this; this.children.splice(this.children.indexOf(voor), 0, n); return n; }
  setAttribute(k: string, v: string) { this.attrs[k] = String(v); }
  getAttribute(k: string) { return this.attrs[k] ?? null; }
  removeAttribute(k: string) { delete this.attrs[k]; }
  addEventListener() {}
  removeEventListener() {}
  contains(n: NodeMock | null): boolean { return !!n && (n === this || this.children.some((c) => c.contains(n))); }
  // Kaart k staat op k * KAART, min de scrollstand; kaarten zijn directe kinderen van de container.
  getBoundingClientRect() {
    return kaartRect(this);
  }
  get classList() { return { add() {} }; }
}
const kaartRect = (n: NodeMock) => {
  while (n.parentNode && n.parentNode !== container) n = n.parentNode;
  const top = (n.parentNode ? container.children.indexOf(n) : 0) * KAART - scrollY;
  return { top, bottom: top + KAART, left: 0, right: 300, width: 300, height: KAART };
};
const doc: any = { activeElement: null, addEventListener() {}, removeEventListener() {}, createElement: (naam: string) => new NodeMock(naam, doc), createTextNode: (tekst: string) => { const n = new NodeMock("#text", doc, 3); n.textContent = tekst; return n; } };
const actief = new Set<string>();
const ids = new WeakMap<object, number>();
const sleutel = (t: string, f: any) => `${t}:${ids.get(f) ?? (ids.set(f, ids.size + 1), ids.get(f))}`;
const luisteraars = () => [...actief].filter((k) => k.startsWith("scroll:") || k.startsWith("resize:")).length;
const win: any = new EventTarget();
const voeg = win.addEventListener.bind(win), haal = win.removeEventListener.bind(win);
win.addEventListener = (...a: any[]) => { actief.add(sleutel(a[0], a[1])); return voeg(...a); };
win.removeEventListener = (...a: any[]) => { actief.delete(sleutel(a[0], a[1])); return haal(...a); };
Object.assign(win, { HTMLIFrameElement: class {}, document: doc, location: { href: "https://x.test/" }, innerHeight: VH });
g.window = win; // bewust zonder IntersectionObserver
g.document = doc;
g.Image = class { decode() { return Promise.resolve(); } set src(_: string) {} };
g.requestAnimationFrame = (f: () => void) => setTimeout(f, 0);
g.cancelAnimationFrame = clearTimeout;
const zetBesparen = (aan: boolean) => Object.defineProperty(globalThis, "navigator", { value: { connection: Object.assign((() => { const e = new EventTarget(); setMaxListeners(0, e); return e; })(), { saveData: aan }) }, configurable: true, writable: true });
setMaxListeners(0, win);
const { createRoot } = await import("react-dom/client");
const t = async (name: string, fn: () => Promise<void>) => { await fn(); console.log("✓", name); };
const alle = (n: NodeMock, f: (n: NodeMock) => boolean, uit: NodeMock[] = []): NodeMock[] => { if (f(n)) uit.push(n); n.children.forEach((c) => alle(c, f, uit)); return uit; };
const container = new NodeMock("div", doc);
const geladen = () => container.children.map((kaart, k) => (alle(kaart, (x) => x.tagName === "IMG" && !!x.attrs.src).length ? k : -1)).filter((k) => k >= 0);
const scrollNaar = async (y: number) => {
  scrollY = y;
  await act(async () => { win.dispatchEvent(new Event("scroll")); await new Promise((r) => setTimeout(r, 5)); });
};

for (const bespaar of [false, true]) {
  await t(`zonder IntersectionObserver${bespaar ? " + databesparing" : ""}: lange lijst laadt een handvol kaarten`, async () => {
    scrollY = 0;
    zetBesparen(bespaar);
    const root = createRoot(container as unknown as Element);
    const kaarten = Array.from({ length: AANTAL }, (_, k) => createElement(Beelden, { key: k, urls: [`https://x.test/f${k}.jpg`] }));
    await act(async () => root.render(kaarten as any));
    await scrollNaar(0);
    const start = geladen();
    assert.ok(start.length > 0, "zichtbare kaart laadt");
    assert.ok(start.length < (bespaar ? 4 : 15), `start: ${start.length} geladen`);
    assert.ok(!start.includes(100), "kaart ver buiten beeld laadt niet");
    await scrollNaar(20000);
    const na = geladen();
    const zichtbaar = Array.from({ length: AANTAL }, (_, k) => k).filter((k) => k * KAART - 20000 < VH && k * KAART - 20000 + KAART > 0);
    for (const k of zichtbaar) assert.ok(na.includes(k), `kaart ${k} zichtbaar na scrollen en geladen`);
    if (bespaar) {
      assert.ok(na.every((k) => zichtbaar.includes(k)), `alleen zichtbare kaarten geladen: ${na}`);
      assert.ok(!na.includes(0), "kaart uit beeld wordt weer losgelaten");
    } else assert.ok(na.length < 25, `na scrollen ${na.length} geladen`);
    await act(async () => root.unmount());
    assert.equal(luisteraars(), 0, "listeners opgeruimd na unmount");
  });
}
