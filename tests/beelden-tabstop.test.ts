// #639: één beeld geeft geen tabstop of bediening; laadfout 2→1 verplaatst focus; een andere foto die wegvalt reset de carrousel niet.
// Nagebootste DOM-elementen (zoals foutgrens.test.ts); de echte toetsenbordvolgorde staat in e2e/beelden-639.spec.mjs.
import assert from "node:assert/strict";
import { act, createElement } from "react";
import { Beelden, Thumb } from "../src/beelden";

const g = globalThis as any;
g.IS_REACT_ACT_ENVIRONMENT = true;
g.MessageChannel = class {
  port1 = { onmessage: null as null | ((e: { data: unknown }) => void) };
  port2 = { postMessage: (data: unknown) => setImmediate(() => this.port1.onmessage?.({ data })) };
};
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
  focus() { doc.activeElement = this; }
  get classList() { return { add() {} }; }
}
const doc: any = { activeElement: null, addEventListener() {}, removeEventListener() {}, createElement: (naam: string) => new NodeMock(naam, doc), createTextNode: (tekst: string) => { const n = new NodeMock("#text", doc, 3); n.textContent = tekst; return n; } };
g.window = Object.assign(new EventTarget(), { HTMLIFrameElement: class {}, document: doc, location: { href: "https://x.test/" } });
g.document = doc;
g.Image = class { decode() { return Promise.resolve(); } set src(_: string) {} };
g.requestAnimationFrame = (f: () => void) => setTimeout(f, 0);
g.cancelAnimationFrame = clearTimeout;
const { createRoot } = await import("react-dom/client");
const t = async (name: string, fn: () => Promise<void>) => { await fn(); console.log("✓", name); };
const alle = (n: NodeMock, f: (n: NodeMock) => boolean, uit: NodeMock[] = []): NodeMock[] => { if (f(n)) uit.push(n); n.children.forEach((c) => alle(c, f, uit)); return uit; };
const props = (n: NodeMock) => n[Object.keys(n).find((k) => k.startsWith("__reactProps$"))! as keyof NodeMock] as any;
const klas = (n: NodeMock, k: string) => (props(n)?.className ?? "").split(" ").includes(k);
const urls = (n: number) => Array.from({ length: n }, (_, k) => `https://x.test/f${k}.jpg`);

async function mount(n: number) {
  const container = new NodeMock("div", doc);
  doc.activeElement = null;
  const root = createRoot(container as unknown as Element);
  await act(async () => root.render(createElement(Beelden, { urls: urls(n), eager: true })));
  const track = () => alle(container, (x) => klas(x, "bl-track"))[0];
  const knoppen = () => alle(container, (x) => x.tagName === "BUTTON");
  const slides = () => alle(container, (x) => klas(x, "bl-slide"));
  const fout = (k: number) => act(async () => props(alle(container, (x) => x.tagName === "IMG")[k]).onError({ currentTarget: { getAttribute: () => "https://x.test/stuk" } }));
  const klassen: string[][] = [];
  const laad = (k: number, w: number, h: number) => { const lijst: string[] = (klassen[k] = []); return act(async () => props(alle(container, (x) => x.tagName === "IMG")[k]).onLoad({ currentTarget: { naturalWidth: w, naturalHeight: h, classList: { add: (c: string) => lijst.push(c) } } })); };
  return { track, knoppen, slides, fout, laad, klassen, container };
}

await t("één beeld: geen tabstop, rol of knoppen", async () => {
  const m = await mount(1);
  assert.equal(props(m.track()).tabIndex, -1);
  assert.equal(props(m.track()).role, undefined);
  assert.equal(props(m.track())["aria-label"], undefined);
  assert.equal(m.knoppen().length, 0);
});

await t("twee beelden: tabstop, rol group en knoppen", async () => {
  const m = await mount(2);
  assert.equal(props(m.track()).tabIndex, 0);
  assert.equal(props(m.track()).role, "group");
  assert.equal(m.knoppen().length, 2);
});

await t("laadfout 2→1: focus naar de fotostrook, bediening weg, overgebleven beeld niet verborgen", async () => {
  const m = await mount(2);
  m.knoppen()[0].focus();
  await m.fout(1);
  assert.equal(doc.activeElement, m.track());
  assert.equal(m.knoppen().length, 0);
  assert.equal(props(m.track()).role, undefined);
  assert.equal(props(m.track())["aria-label"], undefined);
  assert.equal(m.slides().length, 1);
  assert.equal(props(m.slides()[0])["aria-hidden"], undefined);
});

await t("drie beelden: een andere foto die wegvalt springt niet terug naar foto 1", async () => {
  const m = await mount(3);
  const tr = m.track() as any;
  Object.assign(tr, { clientWidth: 100, scrollLeft: 100 });
  await act(async () => { props(tr).onScroll(); await new Promise((r) => setTimeout(r, 5)); });
  assert.equal(props(m.slides()[1])["aria-hidden"], undefined);
  await m.fout(2); // niet de huidige foto
  assert.equal(m.slides().length, 2);
  assert.equal(props(m.slides()[1])["aria-hidden"], undefined);
  assert.equal(props(m.slides()[0])["aria-hidden"], true);
});
await t("#996: één staande foto van 400×1000 blijft staan, wordt zichtbaar (klasse in), zonder bediening", async () => {
  const m = await mount(1);
  await m.laad(0, 400, 1000);
  assert.equal(m.slides().length, 1);
  assert.equal(m.knoppen().length, 0);
  assert.deepEqual(m.klassen[0], ["in"]);
});

await t("#996: staande eerste foto en tweede foto blijven beide; navigatie wisselt de actieve slide", async () => {
  const m = await mount(2);
  await m.laad(0, 400, 1000);
  await m.laad(1, 800, 600);
  assert.deepEqual(m.klassen[0], ["in"]);
  assert.equal(m.slides().length, 2);
  assert.equal(m.knoppen().length, 2);
  const tr = m.track() as any;
  const sprongen: any[] = [];
  Object.assign(tr, { clientWidth: 100, scrollLeft: 0, scrollTo: (o: any) => sprongen.push(o) });
  const knop = (naam: string) => m.knoppen().find((b) => props(b)["aria-label"] === naam)!;
  const klik = (naam: string) => act(async () => props(knop(naam)).onClick({ stopPropagation() {}, preventDefault() {} }));
  const tekst = () => alle(m.container, (x) => props(x)?.["aria-live"] === "polite")[0].children.map((c: any) => c.nodeValue ?? c.textContent).join(""); // React zet tekstknopen via nodeValue
  assert.equal(tekst(), "Foto 1 van 2");
  await klik("Volgende foto");
  assert.equal(sprongen.at(-1).left, 100);
  Object.assign(tr, { scrollLeft: 100 });
  await act(async () => { props(tr).onScroll(); await new Promise((r) => setTimeout(r, 5)); });
  assert.equal(props(m.slides()[1])["aria-hidden"], undefined);
  assert.equal(props(m.slides()[0])["aria-hidden"], true);
  assert.equal(tekst(), "Foto 2 van 2");
  await klik("Vorige foto");
  assert.equal(sprongen.at(-1).left, 0);
  Object.assign(tr, { scrollLeft: 0 });
  await act(async () => { props(tr).onScroll(); await new Promise((r) => setTimeout(r, 5)); });
  assert.equal(props(m.slides()[0])["aria-hidden"], undefined);
  assert.equal(props(m.slides()[1])["aria-hidden"], true);
});

await t("#996: kaartweergave (Thumb) houdt een staande foto en maakt hem zichtbaar", async () => {
  const container = new NodeMock("div", doc);
  const root = createRoot(container as unknown as Element);
  await act(async () => root.render(createElement(Thumb, { urls: urls(2) })));
  const lijst: string[] = [];
  const img = () => alle(container, (x) => x.tagName === "IMG")[0];
  await act(async () => props(img()).onLoad({ currentTarget: { naturalWidth: 400, naturalHeight: 1000, classList: { add: (c: string) => lijst.push(c) } } }));
  assert.deepEqual(lijst, ["in"]);
  assert.equal(props(img()).src.endsWith("f0.jpg") || String(props(img()).src).includes("f0.jpg"), true);
});

await t("#996: banner als tweede foto valt weg, één slide zonder bediening", async () => {
  const m = await mount(2);
  await m.laad(0, 400, 1000);
  await m.laad(1, 1200, 200);
  assert.equal(m.slides().length, 1);
  assert.equal(m.knoppen().length, 0);
});
process.exit(0);
