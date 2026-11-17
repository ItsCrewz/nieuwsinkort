import assert from "node:assert/strict";
import { act, createElement } from "react";
import { Beelden, Thumb, bronUrl, naarRechtstreeks, preloadBeeld } from "../../src/beelden";
import { beeldViaProxy } from "../../src/beeldhost";

class NepImage {
  static beelden: NepImage[] = [];
  src = "";
  referrerPolicy = "";
  decoding = "";
  klaar!: () => void;
  fout!: (reden: Error) => void;
  private resultaat = new Promise<void>((resolve, reject) => { this.klaar = resolve; this.fout = reject; });
  constructor() { NepImage.beelden.push(this); }
  decode() { return this.resultaat; }
}

const image = Object.getOwnPropertyDescriptor(globalThis, "Image");
const nu = Date.now;
let tijd = 1_000_000;
Date.now = () => tijd;
Object.defineProperty(globalThis, "Image", { configurable: true, writable: true, value: NepImage });
try {
  const url = "https://images.nu.nl/m/725.jpg";
  const proxy = beeldViaProxy(url);
  const eerste = preloadBeeld(url);
  assert.strictEqual(preloadBeeld(url), eerste);
  assert.equal(NepImage.beelden[0].src, proxy);
  NepImage.beelden[0].fout(new Error("tijdelijke storing"));
  await Promise.resolve();
  assert.equal(NepImage.beelden[1].src, url);
  assert.equal(naarRechtstreeks(url, proxy), true);
  NepImage.beelden[1].klaar();
  await eerste;
  await preloadBeeld(url);
  assert.equal(NepImage.beelden.length, 2);
  tijd += 60_000;
  assert.equal(bronUrl(url), proxy);
  const herstel = preloadBeeld(url);
  assert.equal(NepImage.beelden[2].src, proxy);
  NepImage.beelden[2].klaar();
  await herstel;
  await preloadBeeld(url);
  assert.equal(NepImage.beelden.length, 3);

  const stuk = "https://images.nu.nl/m/725-stuk.jpg";
  const poging = preloadBeeld(stuk);
  NepImage.beelden[3].fout(new Error("proxy stuk"));
  await Promise.resolve();
  NepImage.beelden[4].fout(new Error("bron stuk"));
  await poging;
  assert.equal(naarRechtstreeks(stuk, stuk), false);
  assert.equal(bronUrl(stuk), stuk);
  tijd += 60_000;
  const later = preloadBeeld(stuk);
  assert.equal(NepImage.beelden[5].src, beeldViaProxy(stuk));
  NepImage.beelden[5].fout(new Error("proxy nog stuk"));
  await Promise.resolve();
  NepImage.beelden[6].fout(new Error("bron nog stuk"));
  await later;
  assert.equal(naarRechtstreeks(stuk, stuk), false);
  assert.equal(NepImage.beelden.length, 7);
} finally {
  Date.now = nu;
  if (image) Object.defineProperty(globalThis, "Image", image);
  else Reflect.deleteProperty(globalThis, "Image");
}

// Een bestaande afbeelding behoudt haar bron en zichtbaarheid bij opnieuw renderen na het verlopen.
const g = globalThis as any;
g.IS_REACT_ACT_ENVIRONMENT = true;
g.MessageChannel = class {
  port1 = { onmessage: null as null | ((e: { data: unknown }) => void) };
  port2 = { postMessage: (data: unknown) => setImmediate(() => this.port1.onmessage?.({ data })) };
};
class NodeMock {
  nodeType = 1; nodeName: string; tagName: string; namespaceURI = "http://www.w3.org/1999/xhtml";
  ownerDocument: any; parentNode: NodeMock | null = null; children: NodeMock[] = [];
  textContent = ""; style = {}; attrs: Record<string, string> = {};
  constructor(naam: string, document: any) { this.nodeName = naam.toUpperCase(); this.tagName = this.nodeName; this.ownerDocument = document; }
  appendChild(n: NodeMock) { n.parentNode = this; this.children.push(n); return n; }
  removeChild(n: NodeMock) { this.children.splice(this.children.indexOf(n), 1); n.parentNode = null; return n; }
  insertBefore(n: NodeMock, voor: NodeMock) { n.parentNode = this; this.children.splice(this.children.indexOf(voor), 0, n); return n; }
  setAttribute(k: string, v: string) { this.attrs[k] = String(v); }
  getAttribute(k: string) { return this.attrs[k] ?? null; }
  removeAttribute(k: string) { delete this.attrs[k]; }
  addEventListener() {} removeEventListener() {}
  get classList() { return { add: (k: string) => { this.attrs.class = k; } }; }
}
const doc: any = { addEventListener() {}, removeEventListener() {}, createElement: (naam: string) => new NodeMock(naam, doc), createTextNode: (tekst: string) => { const n = new NodeMock("#text", doc); n.nodeType = 3; n.textContent = tekst; return n; } };
g.window = Object.assign(new EventTarget(), { HTMLIFrameElement: class {}, document: doc, location: { href: "https://x.test/" } });
g.document = doc;
g.requestAnimationFrame = (f: () => void) => setTimeout(f, 0);
g.cancelAnimationFrame = clearTimeout;
const { createRoot } = await import("react-dom/client");
const alle = (n: NodeMock, naam: string): NodeMock[] => [...(n.tagName === naam ? [n] : []), ...n.children.flatMap((c) => alle(c, naam))];
const props = (n: NodeMock) => (n as any)[Object.keys(n).find((k) => k.startsWith("__reactProps$"))!];
const oudeNu = Date.now;
const oudeImage = Object.getOwnPropertyDescriptor(globalThis, "Image");
let klok = 5_000_000;
Date.now = () => klok;
Object.defineProperty(globalThis, "Image", { configurable: true, writable: true, value: NepImage });
try {
  const url = "https://images.nu.nl/m/725-render.jpg";
  const preload = preloadBeeld(url);
  NepImage.beelden.at(-1)!.fout(new Error("proxy stuk"));
  await Promise.resolve();
  NepImage.beelden.at(-1)!.klaar();
  await preload;
  const container = new NodeMock("div", doc);
  const root = createRoot(container as unknown as Element);
  const render = (extra: string) => createElement("div", null,
    createElement(Beelden, { urls: [url, "https://x.test/tweede.jpg"], eager: true, className: extra }),
    createElement(Thumb, { urls: [url] }));
  await act(async () => root.render(render("eerste")));
  const imgs = alle(container, "IMG");
  assert.equal(imgs.length, 3);
  const slide = imgs[0], thumb = imgs[2];
  assert.equal(slide.attrs.src, url);
  assert.equal(slide.attrs.class, "in");
  assert.equal(thumb.attrs.src, url);
  props(thumb).onLoad({ currentTarget: { naturalWidth: 400, naturalHeight: 300, classList: thumb.classList } });
  klok += 60_000;
  await act(async () => root.render(render("tweede")));
  assert.equal(slide.attrs.src, url);
  assert.equal(slide.attrs.class, "in");
  assert.equal(thumb.attrs.src, url);
  assert.equal(thumb.attrs.class, "in");
  await act(async () => root.unmount());
} finally {
  Date.now = oudeNu;
  if (oudeImage) Object.defineProperty(globalThis, "Image", oudeImage);
  else Reflect.deleteProperty(globalThis, "Image");
}
