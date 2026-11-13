import assert from "node:assert/strict";
import { act, createElement } from "react";
import { zetNepDom } from "../hulp/nepdom";

const { container, doc } = zetNepDom({});
const mq = new EventTarget() as EventTarget & { matches: boolean };
mq.matches = false;
window.matchMedia = () => mq as MediaQueryList;
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
  getItem() { throw new Error("opslag geblokkeerd"); },
  setItem() { throw new Error("opslag geblokkeerd"); },
} });
const { createRoot } = await import("react-dom/client");
const { useTheme } = await import("../../src/app-data");
let huidig: ReturnType<typeof useTheme>;
function Component() { huidig = useTheme(); return null; }
const root = createRoot(container as unknown as Element);
await act(async () => root.render(createElement(Component)));
assert.equal(huidig!.theme, "light");
await act(async () => { mq.matches = true; mq.dispatchEvent(new Event("change")); });
assert.equal(huidig!.theme, "dark", "zonder keuze volgt het thema het systeem");
await act(async () => huidig!.toggle());
assert.equal(doc.documentElement.dataset.theme, "light");
await act(async () => { mq.matches = false; mq.dispatchEvent(new Event("change")); });
await act(async () => { mq.matches = true; mq.dispatchEvent(new Event("change")); });
assert.equal(huidig!.theme, "light", "handmatige keuze blijft behouden bij geblokkeerde opslag");
await act(async () => root.unmount());
console.log("Thema volgt systeem en behoudt handmatige keuze bij geblokkeerde opslag (#753)");
