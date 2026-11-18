import assert from "node:assert/strict";
import React from "react";
import { maakVorigBezoek, useFilters } from "../../src/filters";

// Twee tabs: gedeelde localStorage, aparte sessionStorage (#1246).
const g = globalThis as any;
const lokaal = new Map<string, string>();
const maakOpslag = (m: Map<string, string>) => ({ getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) });
const BEZOEK = "nieuwsinkort-laatste-bezoek";
const echteNu = Date.now;
let nu = 10_000_000;
Date.now = () => nu;
const venster = new EventTarget() as any;
venster.matchMedia = () => ({ matches: true });
g.window = venster;
g.document = Object.assign(new EventTarget(), { visibilityState: "visible" });
g.localStorage = maakOpslag(lokaal);
const dispatcher = (React as any).__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentDispatcher;
let effect!: () => void | (() => void);
dispatcher.current = { useState: (v: any) => [typeof v === "function" ? v() : v, (fn: any) => typeof fn === "function" && fn({})], useRef: (v: any) => ({ current: v }), useCallback: (f: any) => f, useMemo: (f: any) => f(), useEffect: (f: any) => { effect = f; } };
function Tab() { return useFilters(); }
const echteInterval = g.setInterval;
g.setInterval = () => 1; g.clearInterval = () => {};

// Tab A start; tab B opent later met eigen sessieopslag.
lokaal.set(BEZOEK, "9000000");
g.sessionStorage = maakOpslag(new Map());
const a = Tab();
assert.equal(a.vorig, 9_000_000);
const stopA = effect();
assert.equal(lokaal.get(BEZOEK), String(nu));

// Tab A wordt verborgen: geen schrijfactie, referentie voor tab B blijft het laatste echte moment.
nu += 120_000;
g.document.visibilityState = "hidden";
g.document.dispatchEvent(new Event("visibilitychange"));
assert.equal(lokaal.get(BEZOEK), "10000000", "wisselmoment is niet de referentie");
g.sessionStorage = maakOpslag(new Map());
const tabB = maakVorigBezoek(); // eigen module-cache per tab
assert.equal(tabB(), 10_000_000);
assert.ok(tabB() < nu);

// Terugkeer en echt weggaan: latere nieuwe tab krijgt bijgewerkte referentie, nooit in de toekomst.
nu += 60_000;
venster.dispatchEvent(new Event("pagehide"));
assert.equal(lokaal.get(BEZOEK), String(nu));
g.sessionStorage = maakOpslag(new Map());
assert.equal(maakVorigBezoek()(), nu);
lokaal.set(BEZOEK, String(nu + 99_999_999));
g.sessionStorage = maakOpslag(new Map());
assert.equal(maakVorigBezoek()(), 0, "toekomstige tijd geeft geen nieuwe berichten");
if (typeof stopA === "function") stopA();

// Geblokkeerde opslag: geen crash, referentie 0.
const kapot = { getItem: () => { throw new Error("geblokkeerd"); }, setItem: () => { throw new Error("geblokkeerd"); } };
g.localStorage = kapot; g.sessionStorage = kapot;
assert.equal(maakVorigBezoek()(), 0);
const c = Tab(); // module-cache van tab A is al gevuld; hier telt dat er niets crasht
assert.equal(typeof c.vorig, "number");
const stopC = effect();
venster.dispatchEvent(new Event("pagehide"));
if (typeof stopC === "function") stopC();

Date.now = echteNu; g.setInterval = echteInterval;
console.log("✓ vorig bezoek blijft stabiel bij tabwissel (#1246)");
