// useTerugvegen in Node (#590): onderbroken veeg en timers, met document-/element-stubs en nepklok; geen DOM-bibliotheek, geen netwerk.
import assert from "node:assert/strict";
import { act, createElement } from "react";
import { useTerugvegen } from "../src/terugvegen";

const g = globalThis as any;
g.MessageChannel = class {
  port1: { onmessage: ((e: { data: unknown }) => void) | null } = { onmessage: null };
  port2 = { postMessage: (data: unknown) => setImmediate(() => this.port1.onmessage?.({ data })) };
};
g.IS_REACT_ACT_ENVIRONMENT = true;

let rustigAan = false;
let selectieAan = false;
g.window = { HTMLIFrameElement: class {}, innerWidth: 400, matchMedia: () => ({ matches: rustigAan }), getSelection: () => ({ isCollapsed: !selectieAan, toString: () => (selectieAan ? "tekst" : "") }) };
const handlers = new Map<string, (ev: any) => void>();
const body = { style: { overflowX: "" } };
g.document = {
  body, activeElement: null,
  addEventListener: (n: string, f: (ev: any) => void) => handlers.set(n, f),
  removeEventListener: (n: string) => handlers.delete(n),
};

// nepklok alleen voor de terugveer-/sluittimers (200/220 ms); de rest van het proces houdt het echte gedrag
const echtSet = g.setTimeout, echtClear = g.clearTimeout;
let timers = new Map<number, () => void>();
let teller = 1000;
g.setTimeout = (fn: () => void, ms?: number, ...r: unknown[]) => {
  if (ms !== 200 && ms !== 220) return echtSet(fn, ms, ...r);
  timers.set(++teller, fn);
  return teller;
};
g.clearTimeout = (id: number) => (timers.delete(id) ? undefined : echtClear(id));
const loop = () => { const l = [...timers.values()]; timers = new Map(); l.forEach((f) => f()); };

const { createRoot } = await import("react-dom/client");
const noop = () => {};
const container = () =>
  ({ nodeType: 1, nodeName: "DIV", tagName: "DIV", namespaceURI: "http://www.w3.org/1999/xhtml", addEventListener: noop, removeEventListener: noop, ownerDocument: { addEventListener: noop, removeEventListener: noop } }) as unknown as Element;

class TestElement { parentElement = null; matches() { return false; } scrollWidth = 0; clientWidth = 0; }
g.Element = TestElement;
const doel = new TestElement();
const maak = async (terug: () => void) => {
  const art = { style: { transform: "", transition: "" }, classList: { add() {}, remove() {} }, parentElement: null, contains: (el: unknown) => el === doel };
  const ref = { current: art as unknown as HTMLElement };
  function C() { useTerugvegen(ref, terug); return null; }
  const root = createRoot(container());
  await act(async () => root.render(createElement(C)));
  return { art, unmount: () => act(async () => root.unmount()) };
};
const touch = (type: string, punten: [number, number][], ts = 0) =>
  handlers.get(type)!({ type, touches: punten.map(([clientX, clientY]) => ({ clientX, clientY })), target: doel, timeStamp: ts, cancelable: true, preventDefault: noop });
const veeg = (x: number) => { touch("touchstart", [[100, 100]], 0); touch("touchmove", [[100 + x, 100]], 10); };

const t = async (naam: string, fn: () => Promise<void>) => {
  rustigAan = false; selectieAan = false; body.style.overflowX = "scroll"; timers = new Map();
  try { await fn(); } catch (e) { console.error(`mislukt: ${naam}`); throw e; }
  console.log("✓", naam);
};

await t("terugvegen-hook: tweede vinger midden in een veeg herstelt stijl en body-overflow, geen onBack", async () => {
  let n = 0;
  const h = await maak(() => n++);
  veeg(80);
  assert.equal(body.style.overflowX, "hidden");
  assert.equal(h.art.style.transform, "translateX(80px)");
  touch("touchstart", [[100, 100], [200, 100]]);
  loop();
  assert.equal(h.art.style.transform, "");
  assert.equal(h.art.style.transition, "");
  assert.equal(body.style.overflowX, "scroll");
  touch("touchend", [], 50);
  loop();
  assert.equal(n, 0);
  await h.unmount();
});
await t("terugvegen-hook: tweede vinger via touchmove herstelt ook", async () => {
  const h = await maak(() => {});
  veeg(80);
  touch("touchmove", [[180, 100], [250, 100]], 20);
  loop();
  assert.equal(h.art.style.transform, "");
  assert.equal(body.style.overflowX, "scroll");
  await h.unmount();
});
await t("terugvegen-hook: selectie midden in een veeg herstelt", async () => {
  const h = await maak(() => {});
  veeg(80);
  selectieAan = true;
  touch("touchmove", [[190, 100]], 20);
  loop();
  assert.equal(h.art.style.transform, "");
  assert.equal(body.style.overflowX, "scroll");
  await h.unmount();
});
await t("terugvegen-hook: selectie tussen laatste touchmove en touchend sluit niet", async () => {
  for (const r of [false, true]) {
    rustigAan = r;
    let n = 0;
    const h = await maak(() => n++);
    veeg(300);
    selectieAan = true;
    touch("touchend", [], 20);
    loop();
    assert.equal(n, 0);
    assert.equal(h.art.style.transform, "");
    assert.equal(body.style.overflowX, "scroll");
    await h.unmount();
    selectieAan = false;
  }
});
await t("terugvegen-hook: touchcancel herstelt en sluit niet, ook met reduced motion", async () => {
  for (const r of [false, true]) {
    rustigAan = r;
    let n = 0;
    const h = await maak(() => n++);
    veeg(300);
    touch("touchcancel", [], 20);
    loop();
    assert.equal(h.art.style.transform, "");
    assert.equal(body.style.overflowX, "scroll");
    assert.equal(n, 0);
    await h.unmount();
    body.style.overflowX = "scroll";
  }
});
await t("terugvegen-hook: nieuw gebaar tijdens terugveren wist de oude timer", async () => {
  const h = await maak(() => {});
  veeg(40);
  touch("touchend", [], 500);
  assert.equal(h.art.style.transform, "");
  assert.equal(timers.size, 1);
  veeg(60); // nieuw gebaar voor de timer afloopt
  assert.equal(h.art.style.transform, "translateX(60px)");
  loop(); // de oude timer is weg: geen voortijdige reset
  assert.equal(h.art.style.transform, "translateX(60px)");
  assert.equal(body.style.overflowX, "hidden");
  touch("touchend", [], 500);
  loop();
  assert.equal(body.style.overflowX, "scroll");
  await h.unmount();
});
await t("terugvegen-hook: unmount tijdens sluittimer navigeert niet en herstelt", async () => {
  let n = 0;
  const h = await maak(() => n++);
  veeg(200);
  touch("touchend", [], 50);
  assert.equal(timers.size, 1);
  await h.unmount();
  assert.equal(timers.size, 0);
  loop();
  assert.equal(n, 0);
  assert.equal(body.style.overflowX, "scroll");
});
await t("terugvegen-hook: sluitveeg roept na de animatie onBack één keer aan", async () => {
  let n = 0;
  const h = await maak(() => n++);
  veeg(200);
  touch("touchend", [], 50);
  assert.equal(h.art.style.transform, "translateX(400px)");
  loop();
  assert.equal(n, 1);
  assert.equal(h.art.style.transform, "");
  assert.equal(body.style.overflowX, "scroll");
  await h.unmount();
});
await t("terugvegen-hook: nieuw gebaar tijdens de sluitanimatie annuleert de sluiting en herstelt (#658)", async () => {
  let n = 0;
  const h = await maak(() => n++);
  veeg(200);
  touch("touchend", [], 50);
  touch("touchstart", [[100, 100]], 60);
  assert.equal(h.art.style.transform, "");
  assert.equal(body.style.overflowX, "scroll");
  loop();
  assert.equal(n, 0);
  await h.unmount();
});
await t("terugvegen-hook: reduced motion sluit direct", async () => {
  rustigAan = true;
  let n = 0;
  const h = await maak(() => n++);
  veeg(200);
  touch("touchend", [], 50);
  assert.equal(n, 1);
  assert.equal(timers.size, 0);
  assert.equal(h.art.style.transform, "");
  assert.equal(body.style.overflowX, "scroll");
  await h.unmount();
});

console.log("terugvegen-hook: tests geslaagd");
