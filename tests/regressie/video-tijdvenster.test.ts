import assert from "node:assert/strict";
import React from "react";
import { filterVideos, STANDAARD, useVideoKlok, type Tijd } from "../../src/filters";
import type { Video } from "../../src/types";

const g = globalThis as any;
let interval: (() => void) | undefined;
let zichtbaar = "visible";
let luisteraar: (() => void) | undefined;
g.window = { setInterval: (f: () => void, ms: number) => { assert.equal(ms, 60_000); interval = f; return 1; }, clearInterval: () => { interval = undefined; } };
g.document = { get visibilityState() { return zichtbaar; }, addEventListener: (_: string, f: () => void) => { luisteraar = f; }, removeEventListener: () => { luisteraar = undefined; } };
const intern = (React as any).__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentDispatcher;
const videoKlok = useVideoKlok;
let tik = 0;
let deps: unknown[] | undefined;
let opruimen: (() => void) | undefined;
let memoDeps: unknown[] | undefined;
let resultaat: Video[] = [];
const data = [{ titel: "Grens", tijd: "11:00" }] as Video[];
const gegenereerd = "2026-10-30T12:00:00+01:00";
let nu = Date.parse(gegenereerd);
const echteNu = Date.now;
Date.now = () => nu;
function render(tijd: Tijd) {
  intern.current = {
    useState: () => [tik, (f: (n: number) => number) => { tik = f(tik); }],
    useEffect: (f: () => void | (() => void), volgende: unknown[]) => {
      if (!deps || volgende.some((v, i) => !Object.is(v, deps![i]))) {
        opruimen?.();
        deps = volgende;
        opruimen = f() || undefined;
      }
    },
  };
  let klok: number;
  try { klok = videoKlok(tijd); } finally { intern.current = null; }
  const volgende = [data, tijd, klok];
  if (!memoDeps || volgende.some((v, i) => !Object.is(v, memoDeps![i]))) {
    resultaat = filterVideos(data, { ...STANDAARD, tijd }, 0, gegenereerd);
    memoDeps = volgende;
  }
  return resultaat;
}
try {
  assert.equal(render("1u").length, 1);
  nu += 60_000;
  interval!();
  assert.equal(render("1u").length, 0, "ongewijzigde data vervalt na de grens");
  assert.equal(render("3u").length, 1, "een filterwijziging werkt direct");
  zichtbaar = "hidden";
  nu += 2 * 3600_000;
  luisteraar!();
  assert.equal(render("3u").length, 1);
  zichtbaar = "visible";
  luisteraar!();
  assert.equal(render("3u").length, 0, "terugkeer ververst direct");
  render("alles");
  assert.equal(interval, undefined);
  assert.equal(luisteraar, undefined);
} finally { opruimen?.(); Date.now = echteNu; }
