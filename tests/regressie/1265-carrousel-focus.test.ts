// Regressietest #1265: toetsenbordfocus bij een afgevallen carrouselfoto.
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
  contains(n: Knoop | null): boolean { return !!n && (n === this || this.children.some((c) => c.contains(n))); }
  focus() { doc.activeElement = this; }
  matches(selector: string) { return selector === ".bl-nav" && (this.attrs.class ?? "").split(" ").includes("bl-nav"); }
  scrollTo(o: { left: number }) { this.scrolls.push(o.left); }
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

async function toon(lijst: string[]) {
  const houder = new Knoop("div", doc);
  const root = createRoot(houder as unknown as Element);
  await act(async () => root.render(createElement(Beelden, { urls: lijst, eager: true })));
  const track = () => vind(houder, (k) => klasse(k) === "bl-track")[0];
  const beelden = () => vind(houder, (k) => k.tagName === "IMG");
  return {
    houder, track, beelden, root,
    teller: () => vind(houder, (k) => k.attrs["aria-live"] === "polite").map(tekst)[0],
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

for (const naam of ["Vorige foto", "Volgende foto"]) {
  const c = await toon(urls.slice(0, 2));
  c.knop(naam).focus();
  await c.laadfout(urls[0]);
  assert.equal(doc.activeElement, c.track(), `${naam}: focus blijft bij de foto`);
  assert.equal(c.track().attrs["aria-label"], "Foto");
  assert.deepEqual(c.knoppen(), []);
  await act(async () => c.root.unmount());
}

{
  const c = await toon(urls);
  const knop = c.knop("Volgende foto");
  knop.focus();
  await c.laadfout(urls[0]);
  assert.equal(doc.activeElement, knop, "bij twee resterende foto's blijft de knop gefocust");
  c.track().clientWidth = 100;
  let voorkomen = false;
  await act(async () => props(c.track()).onKeyDown({ key: "ArrowRight", preventDefault() { voorkomen = true; } }));
  assert.equal(voorkomen, true);
  assert.equal(c.track().scrolls.at(-1), 100, "pijltjestoets bladert naar de volgende foto");
  await act(async () => props(knop).onClick({ stopPropagation() {}, preventDefault() {} }));
  assert.equal(c.track().scrolls.at(-1), 100);
  const buiten = new Knoop("button", doc);
  buiten.focus();
  const img = c.beelden().find((b) => b.attrs.src === urls[1])!;
  await act(async () => props(img).onLoad({ currentTarget: { naturalWidth: 10, naturalHeight: 10 } }));
  assert.equal(doc.activeElement, buiten, "focus buiten de carrousel blijft staan bij een afgekeurde foto");
  assert.equal(c.beelden()[0].attrs.src, urls[2]);
  await act(async () => c.root.unmount());
}
console.error = oudeFout;
console.log("Carrousel: focus bij afgevallen foto (#1265) geslaagd");
