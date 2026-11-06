import assert from "node:assert/strict";
import React from "react";
import { filterNieuws, STANDAARD, type Filters } from "../../src/filters";
import { useKlok } from "../../src/useklok";
import type { Item } from "../../src/types";

const documentStub = Object.assign(new EventTarget(), { hidden: false });
let tik!: () => void;
let gewist = false;
(globalThis as any).document = documentStub;
(globalThis as any).window = { setInterval: (fn: () => void) => { tik = fn; return 1; }, clearInterval: () => { gewist = true; } };
const dispatcher = (React as any).__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentDispatcher;
let renders = 0;
let effect!: () => () => void;
dispatcher.current = {
  useState: () => [0, (fn: (n: number) => number) => { renders = fn(renders); }],
  useEffect: (fn: () => () => void) => { effect = fn; },
};
function Component() { useKlok(); }
Component();
const opruimen = effect();
const origineel = Date.now;
let nu = Date.parse("2026-11-05T12:00:00Z");
Date.now = () => nu;
try {
  const items = [{ kop: "Bericht", cat: "nl", t: nu - 3600e3 + 500, bronnen: [] }] as Item[];
  let filters: Filters = { ...STANDAARD, tijd: "1u" };
  const bereken = () => filterNieuws(items, filters, 0, new Date(nu).toISOString(), true);
  assert.equal(bereken().items.length, 1);
  assert.equal(bereken().per["1u"], 1);
  nu += 1000;
  tik();
  assert.equal(renders, 1);
  assert.equal(bereken().items.length, 0);
  assert.equal(bereken().per["1u"], 0);
  filters = { ...filters, tijd: "3u" };
  assert.equal(bereken().items.length, 1);
  documentStub.hidden = true;
  tik();
  assert.equal(renders, 1);
  nu += 3 * 3600e3;
  documentStub.hidden = false;
  documentStub.dispatchEvent(new Event("visibilitychange"));
  assert.equal(renders, 2);
  assert.equal(bereken().items.length, 0);
  assert.equal(bereken().per["3u"], 0);
} finally {
  Date.now = origineel;
  opruimen();
}
assert.equal(gewist, true);
documentStub.dispatchEvent(new Event("visibilitychange"));
assert.equal(renders, 2);
console.log("✓ tijdvensters verversen lokaal en bij terugkeer");
