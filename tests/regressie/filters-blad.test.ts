import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { FilterBlad } from "../../src/filters-blad";
import { STANDAARD, type Filters, type Uitkomst } from "../../src/filters";
import type { Item } from "../../src/types";

// De component wordt rechtstreeks gerenderd (hooks gestubd); geen DOM, netwerk of echte klok.
const g = globalThis as any;
const venster = new EventTarget() as EventTarget & { matchMedia: () => { matches: boolean }; setTimeout: (fn: () => void, ms: number) => number };
let minderBeweging = false;
let timer: { fn: () => void; ms: number; gewist: boolean } | undefined;
venster.matchMedia = () => ({ matches: minderBeweging });
venster.setTimeout = (fn, ms) => (timer = { fn, ms, gewist: false }, 1);
(venster as any).clearTimeout = () => { if (timer) timer.gewist = true; };
g.window = venster;
const focus: string[] = [];
const body = { nodeType: 1 };
g.document = { body, activeElement: { focus: () => focus.push("vorig") } };

const intern = (React as any).__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentDispatcher;
let closing = false;
let effect: (() => () => void) | undefined;
const paneel = {};
let refs: { current: any }[] = [];
let refIndex = 0;
intern.current = {
  useState: () => [closing, (v: boolean) => { closing = v; }],
  useRef: (init: any) => {
    const i = refIndex++;
    return refs[i] ?? (refs[i] = { current: i === 0 ? paneel : i === 1 ? { focus: () => focus.push("sluiten") } : init });
  },
  useEffect: (fn: () => () => void) => { effect = fn; },
  useCallback: (fn: unknown) => fn,
  useMemo: (fn: () => unknown) => fn(),
};

const bron = (site: string, href: string) => ({ site, href });
const item = (cat: Item["cat"], kop: string, bronnen: { site: string; href: string }[]) => ({ cat, kop, ai: "", samenvatting: "", punten: [], tijd: "", bronnen }) as unknown as Item;
const haarlem = item("haarlem", "Nieuws uit Haarlem", [bron("A", "https://a.nl/x"), bron("B", "https://b.nl/y")]);
const nl = item("nl", "Kabinet beslist", [bron("A", "https://a.nl/video/1")]);
const wereld = item("buitenland", "Beroering elders", [bron("C", "https://c.nl/z")]);
const catBron = [haarlem, nl, wereld, item("nl", "Nog een", [bron("A", "https://a.nl/q")])];
const bronItems = [haarlem, nl, wereld];
const per = { sinds: 1, vandaag: 2, "1u": 3, "3u": 4, alles: 5 };
const uitkomst = (n: number, tijd: Uitkomst["tijd"] = "vandaag"): Uitkomst => ({ items: new Array(n).fill(nl), tijd, auto: true, per, nieuwSinds: 0 });

const sets: unknown[] = [];
let resets = 0;
let gesloten = 0;
const maak = (o: Partial<Parameters<typeof FilterBlad>[0]> = {}) => {
  refIndex = 0;
  return FilterBlad({ f: STANDAARD, set: (p) => sets.push(p), reset: () => { resets++; }, u: uitkomst(2), bron: bronItems, catBron, vorig: 0, alles: false, onClose: () => { gesloten++; }, ...o }) as any;
};
function vind(node: any, pred: (n: any) => boolean): any[] {
  if (node == null || typeof node !== "object") return [];
  return [...(pred(node) ? [node] : []), ...React.Children.toArray(node.children ?? node.props?.children).flatMap((k) => vind(k, pred))];
}
const nodes = (root: any, type: any) => vind(root, (n) => n.type === type);
const tekst = (node: any): string => typeof node === "string" || typeof node === "number" ? String(node) : node == null ? "" : React.Children.toArray(node.children ?? node.props?.children).map(tekst).join("");
const chips = (root: any) => vind(root, (n) => typeof n.type === "function" && n.type.name === "Chip");
const label = (c: any) => React.Children.toArray(c.props.children).join("");
const chip = (root: any, naam: string) => chips(root).find((c) => label(c) === naam);

// Standaardweergave: portal naar body, aantal berichten, Standaard-knop uit.
let root = maak();
assert.equal(root.containerInfo, body);
assert.match(tekst(root), /2 berichten/);
assert.equal(nodes(root, "button").find((n) => tekst(n) === "Standaard").props.disabled, true);
assert.match(tekst(root), /Automatisch \(vandaag\)/);
assert.equal(chip(root, "Sinds je laatste bezoek"), undefined); // alleen bij vorig > 0
assert.equal(chip(root, "Alles")!.props.on, false);
assert.equal(chip(root, "Automatisch (vandaag)")!.props.on, true);
assert.equal(chip(root, "Politiek"), undefined);
assert.equal(vind(root, (n) => n.props?.id === "f-cat").length, 0);

// Enkelvoud, geen uitkomst en afwijkende filters.
assert.match(tekst(maak({ u: uitkomst(1) })), /1 bericht(?!en)/);
assert.match(tekst(maak({ u: null })), /Tijd geldt ook voor filmpjes/);
root = maak({ f: { ...STANDAARD, tijd: "1u" } });
assert.equal(nodes(root, "button").find((n) => tekst(n) === "Standaard").props.disabled, false);
assert.doesNotMatch(tekst(root), /Automatisch \(/);
assert.notEqual(chip(maak({ vorig: 5 }), "Sinds je laatste bezoek"), undefined);

// Tellingen per chip.
root = maak();
const n = (naam: string) => String(chip(root, naam)!.props.n);
assert.equal(n("Haarlem"), "1");
assert.equal(n("Nederland"), "1");
assert.equal(n("Wereld"), "1");
assert.equal(n("Met video"), "1");
assert.equal(n("Uit meerdere bronnen"), "1");
assert.equal(n("Laatste uur"), "3");

// Klikken zetten de juiste filters.
chip(root, "Laatste 3 uur")!.props.onClick();
chip(root, "Haarlem")!.props.onClick();
chip(root, "Met video")!.props.onClick();
chip(root, "Uit meerdere bronnen")!.props.onClick();
chip(root, "Oudste eerst")!.props.onClick();
chip(root, "Meeste bronnen")!.props.onClick();
assert.deepEqual(sets, [{ tijd: "3u" }, { regio: ["haarlem"] }, { video: true }, { samen: true }, { sort: "oud" }, { sort: "bronnen" }]);
sets.length = 0;
const aan: Filters = { ...STANDAARD, regio: ["haarlem", "nl"], video: true };
root = maak({ f: aan });
chip(root, "Haarlem")!.props.onClick();
chip(root, "Met video")!.props.onClick();
assert.deepEqual(sets, [{ regio: ["nl"] }, { video: false }]);
nodes(root, "button").find((b) => tekst(b) === "Standaard").props.onClick();
assert.equal(resets, 1);

// Rubrieken alleen bij "alles"; klik schakelt aan/uit.
sets.length = 0;
root = maak({ alles: true, f: { ...STANDAARD, cats: ["nl"] } });
assert.equal(chip(root, "Politiek")!.props.n, 0);
assert.equal(chip(root, "Nederland")!.props.n, 2);
assert.equal(chip(root, "Nederland")!.props.on, true);
chip(root, "Politiek")!.props.onClick();
chip(root, "Nederland")!.props.onClick();
assert.deepEqual(sets, [{ cats: ["nl", "politiek"] }, { cats: [] }]);

// Videomodus: alleen tijd.
root = maak({ video: true, alles: true });
assert.equal(chip(root, "Met video"), undefined);
assert.equal(chip(root, "Haarlem"), undefined);
assert.equal(chip(root, "Vandaag")!.props.on, false);

// Een animatie rondt maar eenmaal af, ook bij herhaald sluiten en een oude timer.
refs = [];
closing = false;
root = maak();
let opruimen = effect!();
assert.deepEqual(focus, ["sluiten"]);
const esc = new Event("keydown");
Object.defineProperty(esc, "key", { value: "Escape" });
venster.dispatchEvent(esc);
venster.dispatchEvent(esc);
assert.equal(closing, true);
assert.equal(timer?.ms, 360);
const oudeTimer = timer!;
let sheet = nodes(maak(), "div").find((d) => d.props.className === "sheet fsheet");
sheet.props.onAnimationEnd({ target: {} });
assert.equal(gesloten, 0);
sheet.props.onAnimationEnd({ target: paneel });
assert.equal(gesloten, 1);
assert.equal(oudeTimer.gewist, true);
opruimen();
assert.deepEqual(focus, ["sluiten", "vorig"]);

// Na snel heropenen kan een oude callback het nieuwe blad niet sluiten.
refs = [];
closing = false;
root = maak();
opruimen = effect!();
oudeTimer.fn();
assert.equal(gesloten, 1);
nodes(root, "button").find((b) => b.props.className === "scrim").props.onClick();
const vangnet = timer!;
vangnet.fn();
assert.equal(gesloten, 2);
sheet = nodes(maak(), "div").find((d) => d.props.className === "sheet fsheet");
sheet.props.onAnimationEnd({ target: paneel });
assert.equal(gesloten, 2);
opruimen();
assert.deepEqual(focus, ["sluiten", "vorig", "sluiten", "vorig"]);

// Ontkoppelen vóór het animatie-einde wist het vangnet en maakt de callback onschadelijk.
refs = [];
closing = false;
root = maak();
opruimen = effect!();
nodes(root, "button").find((b) => b.props.className === "scrim").props.onClick();
const verlatenTimer = timer!;
opruimen();
assert.equal(verlatenTimer.gewist, true);
refs = [];
closing = false;
maak();
opruimen = effect!();
verlatenTimer.fn();
assert.equal(gesloten, 2);
opruimen();

// Minder beweging sluit direct en herstelt bij ontkoppelen de focus.
refs = [];
closing = false;
minderBeweging = true;
root = maak();
opruimen = effect!();
nodes(root, "button").find((b) => b.props.className === "scrim").props.onClick();
assert.equal(gesloten, 3);
opruimen();
assert.deepEqual(focus.slice(-2), ["sluiten", "vorig"]);

// Regressie #623: bij her-renderen met gewijzigde filters mag het focus-effect niet opnieuw draaien, in nieuws- én videoweergave.
// Mini-runtime met per-render hookslots en echte deps-vergelijking (Object.is), zoals React ze toepast.
const vorigeDispatcher = intern.current;
function speel(onClose: () => void, rondes: Partial<Parameters<typeof FilterBlad>[0]>[]) {
  const slots: any[] = [];
  let i = 0;
  let r = 0;
  const gelijk = (a?: unknown[], b?: unknown[]) => !!a && !!b && a.length === b.length && a.every((x, k) => Object.is(x, b[k]));
  const wachtend: (() => void)[] = [];
  const log: string[] = [];
  intern.current = {
    useState: (v: boolean) => { const k = i++; slots[k] ??= { v }; return [slots[k].v, (n: boolean) => { slots[k].v = n; }]; },
    useRef: (init: unknown) => { const k = i++, n = r++; slots[k] ??= { current: n === 0 ? paneel : n === 1 ? { focus: () => log.push("sluiten") } : init }; return slots[k]; },
    useCallback: (fn: any, deps: unknown[]) => { const k = i++; if (!slots[k] || !gelijk(slots[k].deps, deps)) slots[k] = { fn, deps }; return slots[k].fn; },
    useMemo: (fn: () => unknown, deps: unknown[]) => { const k = i++; if (!slots[k] || !gelijk(slots[k].deps, deps)) slots[k] = { w: fn(), deps }; return slots[k].w; },
    useEffect: (fn: () => () => void, deps: unknown[]) => {
      const k = i++;
      if (slots[k] && gelijk(slots[k].deps, deps)) return;
      wachtend.push(() => { slots[k]?.cleanup?.(); slots[k] = { deps, cleanup: fn() }; });
    },
  };
  g.document.activeElement = { focus: () => log.push("vorig") };
  for (const o of rondes) {
    i = 0;
    r = 0;
    FilterBlad({ f: STANDAARD, set: () => {}, reset: () => {}, u: uitkomst(2), bron: bronItems, catBron, vorig: 0, alles: false, onClose, ...o });
    wachtend.splice(0).forEach((fn) => fn());
  }
  return log;
}
const wijzigingen = [{}, { f: { ...STANDAARD, tijd: "1u" as const } }, { f: { ...STANDAARD, video: true } }, { f: { ...STANDAARD, regio: ["haarlem" as const] } }, { u: uitkomst(5) }];
const stabiel = () => {};
for (const video of [false, true]) {
  const log = speel(stabiel, wijzigingen.map((w) => ({ ...w, video })));
  assert.deepEqual(log, ["sluiten"], `focus mag maar één keer bewegen (video=${video})`); // geen "vorig" terug, geen tweede "sluiten"
}
// Het blad leest onClose via een ref (#750): ook een onClose die elke render verandert verplaatst de focus maar één keer.
const onstabiel = speel(() => {}, wijzigingen.map((w) => ({ ...w, onClose: () => {} })));
assert.deepEqual(onstabiel, ["sluiten"]);
intern.current = vorigeDispatcher;
// App moet dan ook een stabiele onClose doorgeven (useCallback zonder deps).
const appBron = readFileSync("src/App.tsx", "utf8");
assert.match(appBron, /const sluitFilters = useCallback\(\(\) => setFsheet\(false\), \[\]\)/);
assert.match(appBron, /onClose=\{sluitFilters\}/);
console.log("filters-blad: tests geslaagd");
