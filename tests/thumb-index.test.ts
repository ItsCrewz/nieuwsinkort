// Thumb bij een ververst bericht (#635): echte Thumb-render met minimale DOM-stub (zoals foutgrens.test.ts), zonder DOM-bibliotheek.
import assert from "node:assert/strict";
import { act, createElement } from "react";
import { Thumb } from "../src/beelden";

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
  klassen = new Set<string>();
  naturalWidth = 0;
  naturalHeight = 0;
  classList = { add: (c: string) => { this.klassen.add(c); } };
  constructor(naam: string, document: any, type = 1) { this.nodeName = naam.toUpperCase(); this.tagName = this.nodeName; this.ownerDocument = document; this.nodeType = type; }
  appendChild(n: NodeMock) { n.parentNode = this; this.children.push(n); return n; }
  removeChild(n: NodeMock) { this.children.splice(this.children.indexOf(n), 1); n.parentNode = null; return n; }
  insertBefore(n: NodeMock, voor: NodeMock) { n.parentNode = this; this.children.splice(this.children.indexOf(voor), 0, n); return n; }
  setAttribute(k: string, v: string) { this.attrs[k] = String(v); }
  getAttribute(k: string) { return k in this.attrs ? this.attrs[k] : null; }
  removeAttribute(k: string) { delete this.attrs[k]; }
  addEventListener() {}
  removeEventListener() {}
}
const doc: any = { addEventListener() {}, removeEventListener() {}, createElement: (naam: string) => new NodeMock(naam, doc), createTextNode: (tekst: string) => { const n = new NodeMock("#text", doc, 3); n.textContent = tekst; return n; } };
g.window = Object.assign(new EventTarget(), { HTMLIFrameElement: class {}, document: doc });
g.document = doc;
const { createRoot } = await import("react-dom/client");
const container = new NodeMock("div", doc);
const root = createRoot(container as unknown as Element);
const toon = (urls: string[]) => act(async () => root.render(createElement(Thumb, { urls })));
const img = (): NodeMock | undefined => container.children[0]?.children[0];
const src = () => img()?.getAttribute("src");
const props = (n: NodeMock) => n[Object.keys(n).find((k) => k.startsWith("__reactProps$")) as keyof NodeMock] as any;
const fout = (): Promise<void> => act(async () => { const n = img()!; props(n).onError({ currentTarget: n }); });
const laad = (w: number, h: number): Promise<void> => act(async () => { const n = img()!; n.naturalWidth = w; n.naturalHeight = h; props(n).onLoad({ currentTarget: n }); });

await toon(["https://a/1.jpg", "https://a/2.jpg"]);
assert.equal(src(), "https://a/1.jpg");
await fout(); // eerste foto faalt echt: door naar de tweede
assert.equal(src(), "https://a/2.jpg");
await toon(["https://a/1.jpg", "https://a/2.jpg"]); // nieuwe array, zelfde inhoud: geen herstart
assert.equal(src(), "https://a/2.jpg");
await toon(["https://a/3.jpg", "https://a/4.jpg"]); // ververst bericht: terug naar de eerste
assert.equal(src(), "https://a/3.jpg");
await fout(); // en ook daarna valt hij nog terug op de volgende
assert.equal(src(), "https://a/4.jpg");

// Te kleine foto (icoon/logo): terugval op de volgende; een goede foto blijft staan en krijgt "in".
await toon(["https://a/5.jpg", "https://a/6.jpg"]);
await laad(100, 50);
assert.equal(src(), "https://a/6.jpg");
await laad(400, 300);
assert.equal(src(), "https://a/6.jpg");
assert.ok(img()!.klassen.has("in"));

// Begrensd: faalt de laatste foto, dan verdwijnt de miniatuur en blijft het daar (geen herlaadlus).
await fout();
assert.equal(img(), undefined);
await toon(["https://a/5.jpg", "https://a/6.jpg"]);
assert.equal(img(), undefined);

// Proxy-pad: eerst één rechtstreekse poging voor dezelfde foto, daarna pas de volgende.
await toon(["https://images.nu.nl/p.jpg", "https://a/7.jpg"]);
assert.match(src()!, /^\/media\/beeld\//);
await fout();
assert.equal(src(), "https://images.nu.nl/p.jpg");
await fout();
assert.equal(src(), "https://a/7.jpg");
await act(async () => root.unmount());
console.log("✓ thumb-index");
