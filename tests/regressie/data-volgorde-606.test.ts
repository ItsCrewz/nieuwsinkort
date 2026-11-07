import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { act, createElement } from "react";
import { useData } from "../../src/App";

const g = globalThis as any;
g.MessageChannel = class {
  port1: { onmessage: ((e: { data: unknown }) => void) | null } = { onmessage: null };
  port2 = { postMessage: (data: unknown) => setImmediate(() => this.port1.onmessage?.({ data })) };
};
g.IS_REACT_ACT_ENVIRONMENT = true;
const win = new EventTarget() as any;
win.HTMLIFrameElement = class {};
win.setInterval = setInterval;
win.clearInterval = clearInterval;
g.window = win;
g.document = new EventTarget();
const { createRoot } = await import("react-dom/client");
const noop = () => {};
const container = () => ({ nodeType: 1, nodeName: "DIV", tagName: "DIV", namespaceURI: "http://www.w3.org/1999/xhtml", addEventListener: noop, removeEventListener: noop, ownerDocument: { addEventListener: noop, removeEventListener: noop } }) as unknown as Element;
const fixture = JSON.parse(readFileSync("public/data.json", "utf8"));
function uitgesteld() {
  let resolve!: (r: Response) => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<Response>((ja, nee) => { resolve = ja; reject = nee; });
  return { promise, resolve, reject };
}
async function start() {
  const verzoeken: ReturnType<typeof uitgesteld>[] = [];
  g.fetch = () => { const v = uitgesteld(); verzoeken.push(v); return v.promise; };
  let huidig!: ReturnType<typeof useData>;
  let renders = 0;
  function Component() { huidig = useData(); renders++; return null; }
  const root = createRoot(container());
  await act(async () => root.render(createElement(Component)));
  return { verzoeken, huidig: () => huidig, renders: () => renders, unmount: () => act(async () => root.unmount()) };
}
const datums: Record<string, string> = { nieuw: "2026-11-06T12:00:00Z", oud: "2026-11-06T11:00:00Z", hersteld: "2026-11-06T13:00:00Z", laat: "2026-11-06T14:00:00Z" };
const antwoord = (naam: string) => Response.json({ ...fixture, gegenereerd: datums[naam] });
{
  const h = await start();
  let tweede!: Promise<void>;
  await act(async () => { tweede = h.huidig().reload(); });
  await act(async () => { h.verzoeken[1].resolve(antwoord("nieuw")); await tweede; });
  await act(async () => { h.verzoeken[0].resolve(antwoord("oud")); });
  assert.equal(h.huidig().data?.gegenereerd, datums.nieuw);
  assert.equal(h.huidig().error, false);
  await h.unmount();
}
{
  const h = await start();
  let tweede!: Promise<void>;
  await act(async () => { tweede = h.huidig().reload(); });
  await act(async () => { h.verzoeken[1].resolve(antwoord("nieuw")); await tweede; });
  await act(async () => { h.verzoeken[0].reject(new Error("offline")); });
  await act(async () => { h.verzoeken[2].reject(new Error("offline")); });
  assert.equal(h.huidig().data?.gegenereerd, datums.nieuw);
  assert.equal(h.huidig().error, false);
  let derde!: Promise<void>;
  await act(async () => { derde = h.huidig().reload(); });
  await act(async () => { h.verzoeken[3].reject(new Error("offline")); });
  await act(async () => { h.verzoeken[4].reject(new Error("offline")); await derde; });
  assert.equal(h.huidig().error, true);
  let herstel!: Promise<void>;
  await act(async () => { herstel = h.huidig().reload(); });
  await act(async () => { h.verzoeken[5].resolve(antwoord("hersteld")); await herstel; });
  assert.equal(h.huidig().error, false);
  assert.equal(h.huidig().data?.gegenereerd, datums.hersteld);
  await h.unmount();
}
{
  const h = await start();
  await h.unmount();
  const renders = h.renders();
  await act(async () => { h.verzoeken[0].resolve(antwoord("laat")); });
  assert.equal(h.renders(), renders);
}
console.log("✓ overlappende data-aanvragen en unmount");
