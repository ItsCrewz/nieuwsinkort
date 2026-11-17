// Regressietest #1182: snel opeenvolgende navigatie (knoppen, pijltoetsen, strook) rekent vanaf het gekozen doel, niet vanaf de nog niet bijgewerkte index.
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
g.Image = class { decode() { return Promise.resolve(); } };
const oudeFout = console.error;
console.error = (...a: unknown[]) => { if (!a.some((x) => String(x).includes("fetchPriority"))) oudeFout(...a); };
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
  get nodeValue() { return this.textContent; }
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
const wacht = (ms: number) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });

const urls = fixture.urls;
async function toon(lijst: string[]) {
  const houder = new Knoop("div", doc);
  const root = createRoot(houder as unknown as Element);
  await act(async () => root.render(createElement(Beelden, { urls: lijst, eager: true })));
  const track = () => vind(houder, (k) => klasse(k) === "bl-track")[0];
  track().clientWidth = 100;
  const knop = (naam: string) => vind(houder, (k) => k.attrs["aria-label"] === naam)[0];
  const klik = (naam: string) => act(async () => props(knop(naam)).onClick({ stopPropagation() {}, preventDefault() {} }));
  const toets = (key: string) => act(async () => props(track()).onKeyDown({ key, preventDefault() {} }));
  const strook = (x: number) => act(async () => props(track()).onClick({ clientX: x, currentTarget: track(), stopPropagation() {}, preventDefault() {} }));
  return { root, track, knop, klik, toets, strook, teller: () => vind(houder, (k) => k.attrs["aria-live"] === "polite").map(tekst)[0] };
}
const eind = async (c: Awaited<ReturnType<typeof toon>>, foto: number) => {
  await wacht(30);
  assert.equal(c.track().scrollLeft, foto * 100);
  assert.equal(c.teller(), `Foto ${foto + 1} van 3`);
};

// Twee snelle klikken op Volgende (tijdens animatie): twee foto's verder.
{
  const c = await toon(urls);
  await c.klik("Volgende foto");
  await c.klik("Volgende foto");
  assert.deepEqual(c.track().scrolls, [100, 200]);
  await eind(c, 2);
  await act(async () => c.root.unmount());
}
// Twee snelle rechterpijlen, daarna twee linkerpijlen.
{
  const c = await toon(urls);
  await c.toets("ArrowRight");
  await c.toets("ArrowRight");
  assert.deepEqual(c.track().scrolls, [100, 200]);
  await eind(c, 2);
  await c.toets("ArrowLeft");
  await c.toets("ArrowLeft");
  assert.deepEqual(c.track().scrolls.slice(2), [100, 0]);
  await eind(c, 0);
  await act(async () => c.root.unmount());
}
// Rondlopen: terug vanaf de eerste foto, en drie keer vooruit komt weer op 1.
{
  const c = await toon(urls);
  await c.klik("Vorige foto");
  await c.klik("Vorige foto");
  assert.deepEqual(c.track().scrolls, [200, 100]);
  await eind(c, 1);
  await c.klik("Volgende foto");
  await c.klik("Volgende foto");
  assert.deepEqual(c.track().scrolls.slice(2), [200, 0]);
  await eind(c, 0);
  await act(async () => c.root.unmount());
}
// Klik op de rechterstrook, twee keer snel.
{
  const c = await toon(urls);
  await c.strook(90);
  await c.strook(90);
  assert.deepEqual(c.track().scrolls, [100, 200]);
  await eind(c, 2);
  await act(async () => c.root.unmount());
}
// Handmatig scrollen tijdens de animatie: volgende actie rekent vanaf de echte positie.
{
  const c = await toon(urls);
  await c.klik("Volgende foto");
  await act(async () => { props(c.track()).onTouchStart?.(); c.track().scrollLeft = 200; props(c.track()).onScroll(); await new Promise((r) => setTimeout(r, 5)); });
  assert.equal(c.teller(), "Foto 3 van 3");
  await c.klik("Vorige foto");
  assert.equal(c.track().scrolls.at(-1), 100);
  await eind(c, 1);
  await act(async () => c.root.unmount());
}
// Direct na het bereiken van een doel, vóór de scrollmeting, blijft de positie de basis.
{
  const c = await toon(urls);
  await c.klik("Volgende foto");
  await act(async () => {
    c.track().scrollLeft = 100;
    props(c.track()).onScroll();
    props(c.knop("Volgende foto")).onClick({ stopPropagation() {}, preventDefault() {} });
  });
  assert.deepEqual(c.track().scrolls, [100, 200]);
  await eind(c, 2);
  await act(async () => c.root.unmount());
}
// Een doel op de huidige positie blijft meetellen bij snelle richtingswisselingen.
{
  const c = await toon(urls);
  await c.klik("Volgende foto");
  await c.klik("Vorige foto");
  await c.klik("Volgende foto");
  await act(async () => {
    c.track().scrollLeft = 100;
    props(c.track()).onScroll();
    props(c.knop("Volgende foto")).onClick({ stopPropagation() {}, preventDefault() {} });
  });
  assert.deepEqual(c.track().scrolls, [100, 0, 100, 200]);
  await eind(c, 2);
  await act(async () => c.root.unmount());
}
// Handmatige overname rekent direct met de positie, ook vóór de scrollmeting.
for (const invoer of ["onTouchStart", "onWheel"]) {
  const c = await toon(urls);
  await c.klik("Volgende foto");
  await act(async () => {
    props(c.track())[invoer]?.();
    c.track().scrollLeft = 200;
    props(c.track()).onScroll();
    props(c.knop("Vorige foto")).onClick({ stopPropagation() {}, preventDefault() {} });
  });
  assert.equal(c.track().scrolls.at(-1), 100);
  await eind(c, 1);
  await act(async () => c.root.unmount());
}
// Lijst krimpt tijdens een lopend doel: geen ongeldige index.
{
  const c = await toon(urls);
  await c.klik("Volgende foto");
  await c.klik("Volgende foto");
  await act(async () => c.root.render?.(createElement(Beelden, { urls: urls.slice(0, 2), eager: true })));
  await wacht(30);
  assert.ok(c.track().scrollLeft <= 100);
  assert.match(c.teller(), /^Foto [12] van 2$/);
  await act(async () => c.root.unmount());
}
// Reduced motion: zelfde gedrag.
{
  g.window.matchMedia = (q: string) => ({ matches: q.includes("reduce"), addEventListener() {}, removeEventListener() {} });
  const c = await toon(urls);
  await c.toets("ArrowRight");
  await c.toets("ArrowRight");
  assert.deepEqual(c.track().scrolls, [100, 200]);
  await eind(c, 2);
  await act(async () => c.root.unmount());
}
console.error = oudeFout;
console.log("Beelden: snel navigeren (#1182) geslaagd");
