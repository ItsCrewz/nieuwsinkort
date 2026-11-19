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
const maak = async (terug: () => void, breedte?: number, links?: number) => {
  const klassen = new Set<string>();
  const art = { style: { transform: "", transition: "" }, classList: { add: (naam: string) => klassen.add(naam), remove: (naam: string) => klassen.delete(naam), contains: (naam: string) => klassen.has(naam) }, parentElement: null, contains: (el: unknown) => el === doel, ...(breedte === undefined ? {} : { getBoundingClientRect: () => ({ width: breedte, ...(links === undefined ? {} : { left: links + (Number.parseFloat(/translateX\(([-\d.]+)px/.exec(art.style.transform)?.[1] ?? "0") || 0) }) }) }) };
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
  assert.equal(h.art.classList.contains("veegt"), true);
  touch("touchstart", [[100, 100], [200, 100]]);
  touch("touchend", [[100, 100]], 40);
  touch("touchend", [], 50);
  assert.equal(h.art.style.transform, "");
  assert.equal(h.art.style.transition, "");
  assert.equal(h.art.classList.contains("veegt"), false);
  assert.equal(body.style.overflowX, "scroll");
  loop();
  assert.equal(n, 0);
  await h.unmount();
});
await t("terugvegen-hook: tweede vinger via touchmove herstelt ook", async () => {
  const h = await maak(() => {});
  veeg(80);
  touch("touchmove", [[180, 100], [250, 100]], 20);
  touch("touchend", [], 30);
  assert.equal(h.art.style.transform, "");
  assert.equal(h.art.style.transition, "");
  assert.equal(h.art.classList.contains("veegt"), false);
  assert.equal(body.style.overflowX, "scroll");
  await h.unmount();
});
await t("terugvegen-hook: selectie midden in een veeg herstelt", async () => {
  const h = await maak(() => {});
  veeg(80);
  selectieAan = true;
  touch("touchmove", [[190, 100]], 20);
  touch("touchend", [], 30);
  assert.equal(h.art.style.transform, "");
  assert.equal(h.art.style.transition, "");
  assert.equal(h.art.classList.contains("veegt"), false);
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
await t("terugvegen-hook: nieuw gebaar tijdens de sluitanimatie laat de bevestigde veeg afronden (#1111)", async () => {
  let n = 0;
  const h = await maak(() => n++);
  veeg(200);
  touch("touchend", [], 50);
  touch("touchstart", [[100, 100]], 60);
  assert.equal(h.art.style.transform, "translateX(400px)");
  loop();
  assert.equal(n, 1);
  assert.equal(h.art.style.transform, "");
  assert.equal(body.style.overflowX, "scroll");
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
await t("terugvegen-hook: lege uitgangswaarde komt terug na voltooide en afgebroken veeg en unmount (#1272)", async () => {
  for (const r of [false, true]) {
    rustigAan = r;
    body.style.overflowX = "";
    const h = await maak(() => {});
    veeg(200);
    assert.equal(body.style.overflowX, "hidden");
    touch("touchend", [], 50); loop();
    assert.equal(body.style.overflowX, "");
    veeg(300);
    touch("touchcancel", [], 20); loop();
    assert.equal(body.style.overflowX, "");
    veeg(40); // unmount midden in een veeg
    assert.equal(body.style.overflowX, "hidden");
    await h.unmount();
    assert.equal(body.style.overflowX, "");
  }
});
await t("terugvegen-hook: zonder beslist gebaar blijft overflowX onaangeroerd (#1272)", async () => {
  for (const begin of ["", "scroll"]) {
    body.style.overflowX = begin;
    const h = await maak(() => {});
    touch("touchstart", [[100, 100]], 0); // stand wacht
    await h.unmount();
    assert.equal(body.style.overflowX, begin);
    const h2 = await maak(() => {});
    touch("touchstart", [[100, 100]], 0);
    touch("touchmove", [[100, 160]], 10); // verticaal: nee
    touch("touchend", [], 20);
    assert.equal(body.style.overflowX, begin);
    await h2.unmount();
    assert.equal(body.style.overflowX, begin);
  }
});

await t("terugvegen-hook: pauze en daarna snelle veeg sluit (#1216)", async () => {
  let n = 0;
  const h = await maak(() => n++);
  touch("touchstart", [[100, 100]], 0);
  touch("touchmove", [[115, 100]], 600);
  touch("touchmove", [[150, 100]], 630);
  touch("touchmove", [[180, 100]], 650);
  touch("touchend", [], 655);
  assert.equal(h.art.style.transform, "translateX(400px)");
  loop();
  assert.equal(n, 1);
  await h.unmount();
});
await t("terugvegen-hook: langzaam slepen onder de drempel veert terug (#1216)", async () => {
  let n = 0;
  const h = await maak(() => n++);
  touch("touchstart", [[100, 100]], 0);
  touch("touchmove", [[130, 100]], 300);
  touch("touchmove", [[155, 100]], 600);
  touch("touchmove", [[180, 100]], 900);
  touch("touchend", [], 905);
  loop();
  assert.equal(n, 0);
  assert.equal(h.art.style.transform, "");
  await h.unmount();
});

await t("terugvegen-hook: smal artikel (300) in breed venster (1000): drempel en eindpositie volgen het artikel", async () => {
  g.window.innerWidth = 1000;
  try {
    let n = 0;
    const h = await maak(() => n++, 300);
    veeg(100); // 33% van 300, maar slechts 10% van 1000
    touch("touchend", [], 900);
    assert.equal(h.art.style.transform, "translateX(300px)");
    loop();
    assert.equal(n, 1);
    const k = await maak(() => n++, 300);
    veeg(80); // 27%: veert terug
    touch("touchend", [], 900);
    assert.equal(k.art.style.transform, "");
    loop();
    assert.equal(n, 1);
    const f = await maak(() => n++, 300);
    veeg(60); touch("touchend", [], 30); // snelle flick
    assert.equal(f.art.style.transform, "translateX(300px)");
    loop();
    assert.equal(n, 2);
    rustigAan = true;
    const r = await maak(() => n++, 300);
    veeg(100); touch("touchend", [], 900);
    assert.equal(n, 3);
    assert.equal(r.art.style.transform, "");
    rustigAan = false;
    const v = await maak(() => n++, 300);
    touch("touchstart", [[100, 100]], 0); touch("touchmove", [[110, 200]], 10); touch("touchend", [], 900);
    loop();
    assert.equal(n, 3);
    for (const x of [h, k, f, r, v]) await x.unmount(); // na elkaar: overlappende act()-aanroepen laten listeners te laat opruimen
  } finally { g.window.innerWidth = 400; }
});

await t("terugvegen-hook: gecentreerd artikel (660 op x=170) in breed venster (1000) verdwijnt helemaal buiten beeld", async () => {
  g.window.innerWidth = 1000;
  try {
    let n = 0;
    const h = await maak(() => n++, 660, 170);
    veeg(250); // 38% van 660
    touch("touchend", [], 900);
    assert.equal(h.art.style.transform, "translateX(830px)");
    loop();
    assert.equal(n, 1);
    await h.unmount();
  } finally { g.window.innerWidth = 400; }
});

console.log("terugvegen-hook: tests geslaagd");
