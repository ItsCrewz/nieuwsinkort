// #984: de videovoortgang is met toetsen te bedienen en de globale feedtoetsen laten de slider met rust.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { act, createElement } from "react";
import { isSliderDoel, negeerFeedToets, scrubDoel } from "../src/scrub";

const g = globalThis as any;
// act() plant taken via MessageChannel; Node's echte ports houden het proces open
g.MessageChannel = class {
  port1: { onmessage: ((e: { data: unknown }) => void) | null } = { onmessage: null };
  port2 = { postMessage: (data: unknown) => setImmediate(() => this.port1.onmessage?.({ data })) };
};
g.IS_REACT_ACT_ENVIRONMENT = true;
// feed.tsx leest bij import window; een kale stub volstaat
g.window ??= Object.assign(new EventTarget(), { HTMLIFrameElement: class {}, location: { href: "http://localhost/", hash: "" }, localStorage: { getItem: () => null, setItem: noop, removeItem: noop } });
const { Scrub } = await import("../src/feed");
const { createRoot } = await import("react-dom/client");
const noop = () => {};
const container = () =>
  ({ nodeType: 1, nodeName: "DIV", tagName: "DIV", namespaceURI: "http://www.w3.org/1999/xhtml", addEventListener: noop, removeEventListener: noop, ownerDocument: { addEventListener: noop, removeEventListener: noop } }) as unknown as Element;

const t = (name: string, fn: () => void) => { fn(); console.log("ok", name); };
const ta = async (name: string, fn: () => Promise<void>) => { await fn(); console.log("ok", name); };

t("pijlen verplaatsen 5 s", () => {
  assert.equal(scrubDoel("ArrowRight", 10, 60), 15);
  assert.equal(scrubDoel("ArrowUp", 10, 60), 15);
  assert.equal(scrubDoel("ArrowLeft", 10, 60), 5);
  assert.equal(scrubDoel("ArrowDown", 10, 60), 5);
});
t("Home en End gaan naar begin en einde", () => {
  assert.equal(scrubDoel("Home", 30, 60), 0);
  assert.equal(scrubDoel("End", 30, 60), 60);
});
t("resultaat blijft binnen 0 en de duur", () => {
  assert.equal(scrubDoel("ArrowLeft", 2, 60), 0);
  assert.equal(scrubDoel("ArrowRight", 58, 60), 60);
});
t("ongeldige duur of onbekende toets geeft null", () => {
  for (const d of [0, -1, NaN, Infinity]) assert.equal(scrubDoel("ArrowRight", 1, d), null);
  assert.equal(scrubDoel("a", 1, 60), null);
  assert.equal(scrubDoel("PageDown", 1, 60), null);
});
t("ongeldige huidige stand telt als begin", () => assert.equal(scrubDoel("ArrowRight", NaN, 60), 5));

// Globale handler (feed.tsx onKey) slaat go() over als het doel een slider is.
const slider = { closest: (s: string) => (s.includes("role=slider") ? slider : null) };
const kind = { closest: (s: string) => (s.includes("role=slider") ? slider : null) };
const knop = { closest: () => null };
t("doel binnen de slider: globale handler slaat over", () => {
  assert.equal(isSliderDoel(slider), true);
  assert.equal(isSliderDoel(kind), true);
});
t("doel buiten de slider of leeg: feed blijft werken", () => {
  assert.equal(isSliderDoel(knop), false);
  assert.equal(isSliderDoel(null), false);
});

const TOETSEN = ["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"];
t("globale handler negeert de zes toetsen op een slider, niets anders", () => {
  for (const k of TOETSEN) {
    assert.equal(negeerFeedToets(k, slider), true);
    assert.equal(negeerFeedToets(k, kind), true);
    assert.equal(negeerFeedToets(k, knop), false);
    assert.equal(negeerFeedToets(k, null), false);
  }
  for (const k of ["j", "k", "Escape", "m", " ", "ArrowLeft"]) assert.equal(negeerFeedToets(k, slider), false);
});
t("feed.tsx gebruikt negeerFeedToets in de globale toetsenhandler", () => {
  const src = readFileSync("src/feed.tsx", "utf8");
  const onKey = src.slice(src.indexOf("const onKey = (e: KeyboardEvent)"));
  assert.ok(onKey.slice(0, onKey.indexOf("go(activeRef.current + 1)")).includes("negeerFeedToets("));
});

// Echte Scrub (hooks + onKeyDown) in een harnas zonder DOM.
type Ev = { key: string; prevented: number; stopped: number; preventDefault(): void; stopPropagation(): void };
const ev = (key: string): Ev => ({ key, prevented: 0, stopped: 0, preventDefault() { this.prevented++; }, stopPropagation() { this.stopped++; } });
async function monteer(api: { dur: () => number; cur: () => number; seek: (t: number) => void } | null, enabled: boolean) {
  const seek = { current: api };
  const bar = { set: noop, stop: noop };
  let el: any;
  function C() {
    el = Scrub({ bar, barEl: { current: null }, seek, enabled, title: "Test" } as any);
    return null;
  }
  const root = createRoot(container());
  await act(async () => root.render(createElement(C)));
  return { props: () => el.props, root };
}

await ta("beschikbare slider: toetsen zoeken, ARIA volgt, geen doorgifte", async () => {
  let cur = 10;
  const gezocht: number[] = [];
  const m = await monteer({ dur: () => 60, cur: () => cur, seek: (x) => (gezocht.push(x), (cur = x)) }, true);
  assert.equal(m.props().tabIndex, 0);
  assert.equal(m.props().role, "slider");
  const verwacht: [string, number][] = [["ArrowRight", 15], ["ArrowLeft", 10], ["ArrowUp", 15], ["ArrowDown", 10], ["End", 60], ["Home", 0]];
  for (const [k, w] of verwacht) {
    const e = ev(k);
    await act(async () => m.props().onKeyDown(e));
    assert.equal(gezocht.at(-1), w, k);
    assert.equal(e.prevented, 1, `${k} preventDefault`);
    assert.equal(e.stopped, 1, `${k} stopPropagation`);
  }
  await act(async () => m.props().onKeyDown(ev("End")));
  const p = m.props();
  assert.equal(p["aria-valuemin"], 0);
  assert.equal(p["aria-valuemax"], 100);
  assert.equal(p["aria-valuenow"], 100);
  assert.equal(p["aria-valuetext"], "1:00 van 1:00");
  const n = gezocht.length;
  const x = ev("x");
  await act(async () => m.props().onKeyDown(x));
  assert.equal(gezocht.length, n);
  assert.equal(x.prevented + x.stopped, 0);
  await act(async () => m.root.unmount());
});

await ta("niet-beschikbare slider: geen handler, geen seek, ARIA op nul, feedtoetsen blijven genegeerd", async () => {
  let seeks = 0;
  const m = await monteer({ dur: () => 0, cur: () => 0, seek: () => void seeks++ }, false);
  const p = m.props();
  assert.equal(p.onKeyDown, undefined);
  assert.equal(p.tabIndex, -1);
  assert.equal(p["aria-valuenow"], 0);
  assert.equal(p["aria-valuetext"], "0:00 van 0:00");
  assert.equal(seeks, 0);
  for (const k of TOETSEN) assert.equal(negeerFeedToets(k, slider), true);
  await act(async () => m.root.unmount());
});
