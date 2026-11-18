// #1207: kopfocus alleen bij een ander artikel, niet bij verversing; Escape gebruikt de actuele callback.
import assert from "node:assert/strict";
import { act, createElement } from "react";
import { useKopFocus } from "../../src/kopfocus";

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

let focus = 0;
const kop = { current: { focus: () => void focus++ } as unknown as HTMLElement };
function C({ sleutel, onBack }: { sleutel: string; onBack: () => void }) {
  useKopFocus(kop, sleutel, onBack);
  return null;
}
const root = createRoot(container());
const render = (sleutel: string, onBack: () => void) => act(async () => root.render(createElement(C, { sleutel, onBack })));
const escape = () => win.dispatchEvent(Object.assign(new Event("keydown"), { key: "Escape" }));

let a = 0, b = 0;
await render("a", () => void a++);
assert.equal(focus, 1, "openen focust de kop");
await render("a", () => void a++);
await render("a", () => void b++);
assert.equal(focus, 1, "verversing van hetzelfde artikel verplaatst de focus niet");
escape();
assert.deepEqual([a, b], [0, 1], "Escape gebruikt de actuele callback");
await render("b", () => void a++);
assert.equal(focus, 2, "ander artikel focust de kop opnieuw");
await act(async () => root.unmount());
escape();
assert.deepEqual([a, b], [0, 1], "na sluiten geen listener meer");
console.log("ok artikel-focus-1207");
