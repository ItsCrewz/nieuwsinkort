// Thumb-index bij een ververst bericht (#635): minimale container-stub, zonder DOM-bibliotheek.
import assert from "node:assert/strict";
import { act, createElement } from "react";
import { useThumbIndex } from "../src/beelden";

const g = globalThis as any;
g.MessageChannel = class {
  port1: { onmessage: ((e: { data: unknown }) => void) | null } = { onmessage: null };
  port2 = { postMessage: (data: unknown) => setImmediate(() => this.port1.onmessage?.({ data })) };
};
g.IS_REACT_ACT_ENVIRONMENT = true;
const win = new EventTarget() as EventTarget & { HTMLIFrameElement: unknown };
win.HTMLIFrameElement = class {};
g.window = win;

const { createRoot } = await import("react-dom/client");
const noop = () => {};
const container = () =>
  ({ nodeType: 1, nodeName: "DIV", tagName: "DIV", namespaceURI: "http://www.w3.org/1999/xhtml", addEventListener: noop, removeEventListener: noop, ownerDocument: { addEventListener: noop, removeEventListener: noop } }) as unknown as Element;

const res = { k: -1, setK: (_: number) => {} };
function C({ urls }: { urls: string[] }) {
  const [k, setK] = useThumbIndex(urls);
  res.k = k; res.setK = setK;
  return null;
}
const root = createRoot(container());
const toon = (urls: string[]) => act(async () => root.render(createElement(C, { urls })));

await toon(["https://a/1.jpg", "https://a/2.jpg"]);
assert.equal(res.k, 0);
await act(async () => res.setK(1)); // eerste foto faalt: door naar de tweede
assert.equal(res.k, 1);
await toon(["https://a/1.jpg", "https://a/2.jpg"]); // nieuwe array, zelfde inhoud: geen herstart
assert.equal(res.k, 1);
await toon(["https://a/3.jpg", "https://a/4.jpg"]); // nieuwe lijst: terug naar de eerste
assert.equal(res.k, 0);
await act(async () => res.setK(1)); // ook daarna valt hij nog terug op de volgende
assert.equal(res.k, 1);
await act(async () => root.unmount());
console.log("✓ thumb-index");
