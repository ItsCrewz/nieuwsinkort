// #1252: nieuwsupdate, opnieuw openen en een nog oude servercache.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { act, createElement } from "react";
import { useData } from "../../src/App";
import { useMeer, zetMeerVersie } from "../../src/meer";
import { onRequestGet } from "../../functions/meer";
import type { Item } from "../../src/types";

const g = globalThis as any;
g.MessageChannel = class {
  port1: { onmessage: (() => void) | null } = { onmessage: null };
  port2 = { postMessage: () => setImmediate(() => this.port1.onmessage?.()) };
};
g.IS_REACT_ACT_ENVIRONMENT = true;
const win = new EventTarget() as any;
win.HTMLIFrameElement = class {};
win.setInterval = setInterval; win.clearInterval = clearInterval;
g.window = win; g.document = new EventTarget();
const { createRoot } = await import("react-dom/client");
const noop = () => {};
const container = { nodeType: 1, nodeName: "DIV", tagName: "DIV", namespaceURI: "http://www.w3.org/1999/xhtml", addEventListener: noop, removeEventListener: noop, ownerDocument: { addEventListener: noop, removeEventListener: noop } } as unknown as Element;
const fixture = JSON.parse(readFileSync("public/data.json", "utf8"));
let nieuws = { ...fixture, dag_samenvatting: "oud" };
let blob = { items: { sleutel: { uitleg: ["oud"] } } };
const env = { NIEUWS: { get: async () => blob } };
const fetch0 = globalThis.fetch, nu0 = Date.now;
let klok = Date.now(), aanvragen = 0;
Date.now = () => klok;
g.fetch = async (url: string) => {
  if (String(url).startsWith("/meer?")) { aanvragen++; return onRequestGet({ request: new Request(`https://test.nl${url}`), env }); }
  return Response.json(nieuws);
};
let huidig!: ReturnType<typeof useData>, verdieping!: ReturnType<typeof useMeer>;
const item = { meer: "sleutel" } as Item;
function Detail() { verdieping = useMeer(item); return null; }
function Proef({ open }: { open: boolean }) {
  huidig = useData();
  zetMeerVersie(huidig.data);
  return open && huidig.data ? createElement(Detail) : null;
}
const root = createRoot(container);
try {
  await act(async () => { root.render(createElement(Proef, { open: true })); });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
  assert.deepEqual(verdieping.meer?.uitleg, ["oud"]);
  await act(async () => { root.render(createElement(Proef, { open: false })); });
  nieuws = { ...nieuws, dag_samenvatting: "nieuw" };
  blob = { items: { sleutel: { uitleg: ["nieuw"] } } };
  await act(async () => { await huidig.reload(); });
  assert.equal(huidig.data?.gegenereerd, fixture.gegenereerd);
  assert.equal(huidig.data?.dag_samenvatting, "nieuw");
  await act(async () => { root.render(createElement(Proef, { open: true })); });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
  assert.equal(aanvragen, 2, "gewijzigde inhoud vraagt opnieuw op");
  assert.deepEqual(verdieping.meer?.uitleg, ["oud"], "servercache is nog oud");
  await act(async () => { root.render(createElement(Proef, { open: false })); });
  klok += 60_001;
  await act(async () => { root.render(createElement(Proef, { open: true })); });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
  assert.equal(aanvragen, 3);
  assert.deepEqual(verdieping.meer?.uitleg, ["nieuw"]);
  console.log("✓ nieuwsupdate met gelijk tijdstip ververst verdieping na servercache");
} finally {
  await act(async () => root.unmount());
  Date.now = nu0; globalThis.fetch = fetch0;
}
