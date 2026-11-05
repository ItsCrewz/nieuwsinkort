// Componenttest #625: laadfout in de fotocarrousel (Beelden) met een minimale nep-DOM, zonder DOM-bibliotheek.
// Controleert zichtbare foto, teller, navigatie en het verdwijnen van het laatste beeld.
import assert from "node:assert/strict";
import { act, createElement } from "react";
import { Beelden, bronUrl } from "../../src/beelden";
import fixture from "./fixtures/carrousel-laadfout-625.json";

const { urls } = fixture;
const g = globalThis as any;
g.IS_REACT_ACT_ENVIRONMENT = true;
g.MessageChannel = class {
  port1 = { onmessage: null as null | ((e: { data: unknown }) => void) };
  port2 = { postMessage: (data: unknown) => setImmediate(() => this.port1.onmessage?.({ data })) };
};
g.requestAnimationFrame = (f: () => void) => setTimeout(f, 0);
g.cancelAnimationFrame = (n: number) => clearTimeout(n);
g.Image = class { decode() { return Promise.resolve(); } }; // preloadBeeld
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
  scrollLeft = 0;
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
  scrollTo(o: { left: number }) { this.scrolls.push(o.left); }
  getBoundingClientRect() { return { left: 0, width: 100 }; }
  get nodeValue() { return this.textContent; } // React werkt tekstknopen zo bij
  set nodeValue(v: string) { this.textContent = v; }
  get classList() { return { add: () => {} }; }
}
const doc: any = { addEventListener() {}, removeEventListener() {}, createElement: (n: string) => new Knoop(n, doc), createTextNode: (t: string) => { const k = new Knoop("#text", doc, 3); k.textContent = t; return k; } };
g.window = Object.assign(new EventTarget(), { HTMLIFrameElement: class {}, document: doc });
g.document = doc;
const { createRoot } = await import("react-dom/client");

const tekst = (n: Knoop): string => (n.nodeType === 3 ? n.textContent : n.children.map(tekst).join(""));
const vind = (n: Knoop, f: (k: Knoop) => boolean): Knoop[] => [...(f(n) ? [n] : []), ...n.children.flatMap((c) => vind(c, f))];
const props = (n: Knoop) => (n as any)[Object.keys(n).find((k) => k.startsWith("__reactProps$"))!];
const klasse = (n: Knoop) => n.attrs.class ?? "";

async function toon(lijst: string[]) {
  const houder = new Knoop("div", doc);
  const root = createRoot(houder as unknown as Element);
  await act(async () => root.render(createElement(Beelden, { urls: lijst, eager: true })));
  const track = () => vind(houder, (k) => klasse(k) === "bl-track")[0];
  const beelden = () => vind(houder, (k) => k.tagName === "IMG");
  return {
    houder, track, beelden, root,
    teller: () => vind(houder, (k) => klasse(k) === "sr-only").map(tekst)[0],
    stippen: () => vind(houder, (k) => klasse(k) === "bl-dots")[0]?.children.map(klasse) ?? [],
    knoppen: () => vind(houder, (k) => k.tagName === "BUTTON").map((k) => k.attrs["aria-label"]),
    knop: (naam: string) => vind(houder, (k) => k.attrs["aria-label"] === naam)[0],
    // Bladeren: de track scrolt naar foto n en meldt dat via onScroll (rAF-gedreven).
    scrollNaar: async (n: number) => {
      track().clientWidth = 100;
      track().scrollLeft = n * 100;
      await act(async () => { props(track()).onScroll(); await new Promise((r) => setTimeout(r, 5)); });
    },
    laadfout: (u: string) => act(async () => {
      const im = beelden().find((b) => b.attrs.src === bronUrl(u));
      assert.ok(im, `<img> voor ${u} aanwezig`);
      props(im).onError({ currentTarget: im });
    }),
  };
}

assert.equal(urls.length, 3);
assert.equal(bronUrl(urls[0]), urls[0], "fixture-hosts lopen niet via de proxy: laadfout = direct wegvallen");

// 1. Eerdere foto valt weg terwijl foto 2 actief is: dezelfde foto blijft actief, teller klopt, track schuift terug.
{
  const c = await toon(urls);
  assert.equal(c.teller(), "Foto 1 van 3");
  assert.deepEqual(c.knoppen(), ["Vorige foto", "Volgende foto"]);
  await c.scrollNaar(1);
  assert.equal(c.teller(), "Foto 2 van 3");
  await c.laadfout(urls[0]);
  assert.equal(c.teller(), "Foto 1 van 2", "de actieve foto (nu eerste van twee) blijft dezelfde");
  assert.deepEqual(c.stippen(), ["on", ""]);
  assert.equal(c.track().scrollLeft, 0, "track staat weer op de actieve foto");
  assert.equal(vind(c.houder, (k) => k.attrs["aria-hidden"] === undefined && klasse(k) === "bl-slide")[0].children[0].attrs.src, urls[1], "zichtbare foto is foto 2");
  // Navigatie werkt op de nieuwe lijst: volgende naar index 1, vorige wikkelt naar index 1.
  const t = c.track();
  await act(async () => props(c.knop("Volgende foto")).onClick({ stopPropagation() {}, preventDefault() {} }));
  assert.equal(t.scrolls.at(-1), 100);
  await act(async () => props(c.knop("Vorige foto")).onClick({ stopPropagation() {}, preventDefault() {} }));
  assert.equal(t.scrolls.at(-1), 100, "vorige vanaf eerste wikkelt naar laatste van twee");
  await act(async () => c.root.unmount());
}

// 2. Laatste foto actief en valt weg: selectie klemt op de nieuwe laatste.
{
  const c = await toon(urls);
  await c.scrollNaar(2);
  assert.equal(c.teller(), "Foto 3 van 3");
  await c.laadfout(urls[2]);
  assert.equal(c.teller(), "Foto 2 van 2");
  assert.deepEqual(c.stippen(), ["", "on"]);
  assert.equal(c.track().scrollLeft, 100);
  await act(async () => props(c.knop("Volgende foto")).onClick({ stopPropagation() {}, preventDefault() {} }));
  assert.equal(c.track().scrolls.at(-1), 0, "volgende wikkelt naar de eerste");
  await act(async () => c.root.unmount());
}

// 3. Alle beelden vallen weg: eerst enkelvoudig zonder carrouselbediening, daarna geen fotoblok.
{
  const c = await toon(urls);
  await c.laadfout(urls[0]);
  assert.equal(c.teller(), "Foto 1 van 2");
  await c.laadfout(urls[1]);
  assert.equal(c.teller(), undefined, "één foto over: geen teller");
  assert.deepEqual(c.knoppen(), [], "één foto over: geen navigatie");
  assert.deepEqual(c.stippen(), []);
  assert.equal(c.beelden().length, 1);
  assert.equal(c.beelden()[0].attrs.src, urls[2], "de laatste foto blijft zichtbaar");
  await c.laadfout(urls[2]);
  assert.equal(c.houder.children.length, 0, "laatste beeld weg: geen fotoblok meer");
  await act(async () => c.root.unmount());
}

// 4. Twee fouten in één batch rekenen op de actuele lijst.
{
  const c = await toon(urls);
  await c.scrollNaar(1);
  await act(async () => {
    for (const u of [urls[0], urls[1]]) {
      const im = c.beelden().find((b) => b.attrs.src === bronUrl(u))!;
      props(im).onError({ currentTarget: im });
    }
  });
  assert.equal(c.beelden().length, 1);
  assert.equal(c.beelden()[0].attrs.src, urls[2]);
  assert.equal(c.teller(), undefined);
  await act(async () => c.root.unmount());
}
console.error = oudeFout;
console.log("Beelden: carrousel-laadfouttests (#625) geslaagd");
