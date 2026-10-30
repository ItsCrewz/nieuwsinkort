import assert from "node:assert/strict";
import { act, createElement } from "react";
import { Foutgrens, registreerClientfouten } from "../src/foutgrens";

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
  constructor(naam: string, document: any, type = 1) { this.nodeName = naam.toUpperCase(); this.tagName = this.nodeName; this.ownerDocument = document; this.nodeType = type; }
  appendChild(n: NodeMock) { n.parentNode = this; this.children.push(n); return n; }
  removeChild(n: NodeMock) { this.children.splice(this.children.indexOf(n), 1); n.parentNode = null; return n; }
  insertBefore(n: NodeMock, voor: NodeMock) { n.parentNode = this; this.children.splice(this.children.indexOf(voor), 0, n); return n; }
  setAttribute() {}
  removeAttribute() {}
  addEventListener() {}
  removeEventListener() {}
}
const doc: any = { addEventListener() {}, removeEventListener() {}, createElement: (naam: string) => new NodeMock(naam, doc), createTextNode: (tekst: string) => { const n = new NodeMock("#text", doc, 3); n.textContent = tekst; return n; } };
g.window = Object.assign(new EventTarget(), { HTMLIFrameElement: class {}, document: doc });
g.document = doc;
const { createRoot } = await import("react-dom/client");
const container = new NodeMock("div", doc);
const root = createRoot(container as unknown as Element);
let gooi = true;
function Kapot() { if (gooi) throw new Error("test"); return createElement("span", null, "hersteld"); }
const oud = console.error;
const logs: unknown[][] = [];
console.error = (...args: unknown[]) => { logs.push(args); };
try {
  await act(async () => root.render(createElement("div", null,
    createElement("span", null, "overige inhoud"),
    createElement(Foutgrens, { code: "CLIENT_TEST", children: createElement(Kapot) })
  )));
  const inhoud = container.children[0];
  assert.equal(inhoud.children[0].textContent, "overige inhoud");
  const fallback = inhoud.children[1];
  assert.equal(fallback.children[0].textContent, "Dit onderdeel kon niet worden weergegeven.");
  assert.equal(fallback.children[1].textContent, "Opnieuw proberen");
  assert.ok(logs.some((args) => args[0] === "CLIENT_TEST"));
  gooi = false;
  // De knop roept de herstelactie van de grens aan.
  const knop = fallback.children[1] as any;
  const propsKey = Object.keys(knop).find((k) => k.startsWith("__reactProps$"))!;
  await act(async () => knop[propsKey].onClick());
  assert.equal(inhoud.children[1].textContent, "hersteld");
  const win = new EventTarget();
  registreerClientfouten(win as Window);
  win.dispatchEvent(new Event("error"));
  win.dispatchEvent(new Event("unhandledrejection"));
  assert.ok(logs.some((args) => args[0] === "CLIENT_ONERROR"));
  assert.ok(logs.some((args) => args[0] === "CLIENT_UNHANDLED_REJECTION"));
  await act(async () => root.unmount());
} finally { console.error = oud; }
