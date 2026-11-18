import assert from "node:assert/strict";
import React from "react";
import { DeelBlok } from "../../src/detail";
import type { Item } from "../../src/types";

// Hook-stub (zoals in joey-delen-focus-925): effecten worden bewaard zodat unmount na te bootsen is.
const intern = React as unknown as { __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED: { ReactCurrentDispatcher: { current: unknown } } };
const dispatcher = intern.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentDispatcher;
const vorig = dispatcher.current;
const url = "https://nieuwsinkort.nl/bericht/test";
const item = { kop: "Testbericht" } as Item;
type Uitgesteld = { ok: () => void; fout: (e: Error) => void };

// Eén "mount" van DeelBlok met eigen hookstaat; key={url} betekent in React een nieuwe mount.
function mount() {
  const hooks: unknown[] = [];
  const effecten: (() => (() => void) | void)[] = [];
  let index = 0;
  dispatcher.current = {
    useState(init: unknown) { const i = index++; if (!(i in hooks)) hooks[i] = init; return [hooks[i], (w: unknown) => { hooks[i] = w; }]; },
    useRef(init: unknown) { const i = index++; if (!(i in hooks)) hooks[i] = { current: init }; return hooks[i]; },
    useCallback(fn: unknown) { const i = index++; if (!(i in hooks)) hooks[i] = fn; return hooks[i]; },
    useEffect(fn: () => (() => void) | void) { index++; effecten.push(fn); },
  };
  const render = () => { index = 0; effecten.length = 0; return DeelBlok({ item, url }).props.children as React.ReactElement[]; };
  const melding = () => render()[1].props.children as string;
  const klik = () => render()[0].props.onClick() as Promise<void>;
  // De eerste effect-cleanup is de unmount-cleanup.
  const unmount = () => { render(); const c = effecten[0](); if (c) c(); };
  return { melding, klik, unmount };
}

const oudeNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
const wachtrij: Uitgesteld[] = [];
Object.defineProperty(globalThis, "navigator", { configurable: true, value: {
  share: () => new Promise<void>((ok, fout) => { wachtrij.push({ ok, fout }); }),
  clipboard: { writeText: async () => { throw new Error("geweigerd"); } },
} });
const tik = () => new Promise((r) => setTimeout(r, 0));
const GEDEELD = "";
const HANDMATIG = "Kopieer handmatig met Ctrl+C of Command+C.";
try {
  // Omgekeerde volgorde: eerst klik 2 klaar (handmatig), dan het late resultaat van klik 1 (gedeeld).
  let b = mount();
  const p1 = b.klik(); const p2 = b.klik();
  wachtrij[1].fout(new Error("geweigerd")); await p2; await tik();
  assert.equal(b.melding(), HANDMATIG);
  wachtrij[0].ok(); await p1; await tik();
  assert.equal(b.melding(), HANDMATIG, "laat resultaat van vorige actie overschrijft niets");
  wachtrij.length = 0;

  // Omgekeerde volgorde andersom: late afwijzing van klik 1 mag de melding van klik 2 niet vervangen.
  b = mount();
  const q1 = b.klik(); const q2 = b.klik();
  wachtrij[1].ok(); await q2; await tik();
  assert.equal(b.melding(), GEDEELD);
  wachtrij[0].fout(new Error("geweigerd")); await q1; await tik();
  assert.equal(b.melding(), GEDEELD, "late fout verschijnt niet als handmatige invoer");
  wachtrij.length = 0;

  // Artikelwissel/sluiten tijdens delen: resultaat na unmount heeft geen effect.
  b = mount();
  const r1 = b.klik();
  b.unmount();
  wachtrij[0].fout(new Error("geweigerd")); await r1; await tik();
  assert.equal(b.melding(), GEDEELD);
  wachtrij.length = 0;

  // Annuleren en een enkele gewone actie blijven werken.
  b = mount();
  const s1 = b.klik();
  wachtrij[0].fout(Object.assign(new Error("stop"), { name: "AbortError" })); await s1; await tik();
  assert.equal(b.melding(), GEDEELD);
  wachtrij.length = 0;
  const s2 = b.klik();
  wachtrij[0].fout(new Error("geweigerd")); await s2; await tik();
  assert.equal(b.melding(), HANDMATIG);
} finally {
  dispatcher.current = vorig;
  if (oudeNavigator) Object.defineProperty(globalThis, "navigator", oudeNavigator);
  else Reflect.deleteProperty(globalThis, "navigator");
}
