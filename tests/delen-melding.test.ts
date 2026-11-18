import assert from "node:assert/strict";
import React from "react";
import { DeelBlok } from "../src/detail";
import type { Item } from "../src/types";

// Hook-stub met dependency-vergelijking en nepklok: controleert dat elke kopieeractie de timer van 3 s herstart (#1211).
const intern = React as unknown as { __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED: { ReactCurrentDispatcher: { current: unknown } } };
const dispatcher = intern.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentDispatcher;
const vorig = dispatcher.current;
const item = { kop: "Testbericht" } as Item;
const url = "https://nieuwsinkort.nl/bericht/test";

let nu = 0;
const timers = new Map<number, { op: number; fn: () => void }>();
let timerId = 0;
const echteSet = globalThis.setTimeout, echteClear = globalThis.clearTimeout;
const gaVerder = (ms: number) => {
  nu += ms;
  for (const [id, tm] of [...timers]) if (tm.op <= nu) { timers.delete(id); tm.fn(); }
};

function mount() {
  const hooks: unknown[] = [];
  const deps = new Map<number, unknown[] | undefined>();
  const opruim = new Map<number, () => void>();
  let index = 0;
  let nodig: (() => void)[] = [];
  dispatcher.current = {
    useState(init: unknown) { const i = index++; if (!(i in hooks)) hooks[i] = init; return [hooks[i], (w: unknown) => { hooks[i] = typeof w === "function" ? (w as (v: unknown) => unknown)(hooks[i]) : w; }]; },
    useRef(init: unknown) { const i = index++; if (!(i in hooks)) hooks[i] = { current: init }; return hooks[i]; },
    useCallback(fn: unknown) { const i = index++; if (!(i in hooks)) hooks[i] = fn; return hooks[i]; },
    useEffect(fn: () => (() => void) | void, d?: unknown[]) {
      const i = index++;
      const oud = deps.get(i);
      if (deps.has(i) && d && oud && d.every((x, n) => Object.is(x, oud[n]))) return;
      deps.set(i, d);
      nodig.push(() => { opruim.get(i)?.(); const c = fn(); if (c) opruim.set(i, c); else opruim.delete(i); });
    },
  };
  const render = () => {
    index = 0; nodig = [];
    const kinderen = (DeelBlok({ item, url }).props.children as React.ReactElement[]);
    nodig.forEach((f) => f());
    return kinderen;
  };
  render();
  return {
    melding: () => render()[1].props.children as string,
    klik: async () => { await render()[0].props.onClick(); render(); },
    unmount: () => opruim.forEach((c) => c()),
  };
}

const oudeNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
Object.defineProperty(globalThis, "navigator", { configurable: true, value: { clipboard: { writeText: async () => {} } } });
globalThis.setTimeout = ((fn: () => void, ms: number) => { const id = ++timerId; timers.set(id, { op: nu + ms, fn }); return id; }) as unknown as typeof setTimeout;
globalThis.clearTimeout = ((id: number) => { timers.delete(id); }) as unknown as typeof clearTimeout;
try {
  const b = mount();
  await b.klik();
  assert.equal(b.melding(), "Link gekopieerd");
  gaVerder(2000);
  await b.klik();
  assert.equal(b.melding(), "Link gekopieerd");
  gaVerder(2000); // 4 s na de eerste klik, 2 s na de laatste: nog zichtbaar
  assert.equal(b.melding(), "Link gekopieerd", "tweede actie krijgt eigen bevestigingsperiode");
  gaVerder(1100);
  assert.equal(b.melding(), "", "melding verdwijnt 3 s na de laatste actie");

  const c = mount();
  await c.klik();
  assert.equal(timers.size, 1);
  c.unmount();
  assert.equal(timers.size, 0, "unmount ruimt de timer op");
  console.log("ok delen-melding");
} finally {
  globalThis.setTimeout = echteSet; globalThis.clearTimeout = echteClear;
  dispatcher.current = vorig;
  if (oudeNavigator) Object.defineProperty(globalThis, "navigator", oudeNavigator);
  else Reflect.deleteProperty(globalThis, "navigator");
}
