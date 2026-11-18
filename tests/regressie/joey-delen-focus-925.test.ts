import assert from "node:assert/strict";
import { act, createElement } from "react";
import type { Item } from "../../src/types";

// Echte React-render van DetailView (#1234) met een minimale nep-DOM (geen jsdom): de handmatige deellink wordt eenmaal geselecteerd en
// gefocust, een hertekening met dezelfde url steelt de focus niet terug, een andere url remount het blok (key={url}) en een
// verdwenen en teruggekeerde invoer wordt opnieuw geselecteerd.
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
  get parentNode() { return this.ouder; } get parentElement() { return this.ouder; }
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
  classList = { add() {}, remove() {}, contains: () => false };
  focus() { doc.activeElement = this; } select() { this.geselecteerd++; } geselecteerd = 0;
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


const { DetailView } = await import("../../src/detail");
const { createRoot } = await import("react-dom/client");
const maakItem = (id: string, kop = "Testbericht"): Item => ({ id, kop, cat: "nl", ai: "Een korte inleiding over het testbericht." } as Item);
const dag = "2026-01-05";
const oudeNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
let clipboardWerkt = false;
Object.defineProperty(globalThis, "navigator", { configurable: true, value: { clipboard: { writeText: async () => { if (!clipboardWerkt) throw new Error("geweigerd"); } } } });

const zoek = (f: (k: Knoop) => boolean) => doc.body.vind(f) ?? wortel.vind(f);
const wortel = new Knoop("DIV");
const root = createRoot(wortel as unknown as Element);
const toon = (item: Item) => act(async () => root.render(createElement(DetailView, { item, onBack: () => {}, bionic: false, dag })));
const knop = () => zoek((k) => k.attrs.class === "deel-knop");
const invoer = () => zoek((k) => k.attrs.class === "deel-invoer");
const klik = async () => {
  const sleutel = Object.keys(knop()!).find((s) => s.startsWith("__reactProps$"))!;
  await act(async () => { await (knop() as any)[sleutel].onClick(); });
};

try {
  await toon(maakItem("abcd1234"));
  assert.equal(invoer(), null, "fallback is nog dicht");

  // 1. De fallback opent: focus in de invoer en de link is geselecteerd.
  await klik();
  const veld = invoer()!;
  assert.ok(veld, "fallback opent na mislukt delen");
  assert.equal(doc.activeElement, veld, "focus staat in de invoer");
  assert.equal(veld.geselecteerd, 1, "link is geselecteerd");

  // 2. Tab naar een ander element en een hertekening met dezelfde url (nieuw item-object): focus en selectie blijven.
  const volgend = new Knoop("BUTTON");
  doc.activeElement = volgend;
  await toon(maakItem("abcd1234"));
  assert.equal(invoer(), veld, "dezelfde invoer blijft staan");
  assert.equal(doc.activeElement, volgend, "hertekening steelt de focus niet terug");
  assert.equal(veld.geselecteerd, 1, "link wordt niet opnieuw geselecteerd");

  // 3. Andere url: key={url} remount het blok, de fallback verdwijnt en delen werkt weer.
  await toon(maakItem("efgh5678"));
  assert.equal(invoer(), null, "fallback verdwijnt bij een andere url");
  assert.equal(knop()!.attrs.disabled, undefined, "deelknop is bruikbaar");
  await klik();
  const nieuw = invoer()!;
  assert.ok(nieuw && nieuw !== veld, "nieuwe klik opent de fallback opnieuw");
  assert.equal(doc.activeElement, nieuw);
  assert.equal(nieuw.geselecteerd, 1, "nieuwe link is geselecteerd");

  // 4. Invoer verdwijnt (geslaagd kopiëren) en komt terug (mislukt): opnieuw selecteren en focussen.
  clipboardWerkt = true;
  await klik();
  assert.equal(invoer(), null, "invoer verdwijnt na geslaagd kopiëren");
  clipboardWerkt = false;
  doc.activeElement = volgend;
  await klik();
  const terug = invoer()!;
  assert.ok(terug, "invoer komt terug");
  assert.equal(doc.activeElement, terug);
  assert.equal(terug.geselecteerd, 1, "teruggekeerde invoer is opnieuw geselecteerd");
  await act(async () => root.unmount());
  console.log("ok joey-delen-focus-925");
} catch (e) { process.stderr.write("FOUT " + String((e as Error)?.stack ?? e) + "\n"); process.exitCode = 1; } finally {
  if (oudeNavigator) Object.defineProperty(globalThis, "navigator", oudeNavigator);
  else Reflect.deleteProperty(globalThis, "navigator");
}
