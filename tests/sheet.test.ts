import assert from "node:assert/strict";
import React from "react";
import { SourcesSheet } from "../src/sheet";
import { Switch } from "../src/ui";
import type { SourceGroup } from "../src/sources";

// De component wordt rechtstreeks gerenderd; effecten en timers zijn bestuurbaar.
const g = globalThis as any;
const echteDatum = Date;
const nu = new echteDatum("2026-10-30T12:00:00Z").valueOf();
g.Date = class extends echteDatum {
  constructor(...args: any[]) { super(...(args.length ? args : [nu]) as [any]); }
  static now() { return nu; }
};
const venster = new EventTarget() as EventTarget & { matchMedia: () => { matches: boolean }; setTimeout: (fn: () => void, ms: number) => number };
let minderBeweging = false;
let timer: { fn: () => void; ms: number } | undefined;
venster.matchMedia = () => ({ matches: minderBeweging });
venster.setTimeout = (fn, ms) => (timer = { fn, ms }, 1);
g.window = venster;
const focus: string[] = [];
const vorig = { focus: () => focus.push("vorig") };
const body = { nodeType: 1, style: { overflow: "auto" } };
g.document = { body, activeElement: vorig };

const intern = (React as any).__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentDispatcher;
let closing = false;
let effect: (() => () => void) | undefined;
const paneel = {};
intern.current = {
  useState: () => [closing, (v: boolean) => { closing = v; }],
  useRef: (() => { let index = 0; return () => ({ current: index++ % 2 === 0 ? paneel : { focus: () => focus.push("sluiten") } }); })(),
  useEffect: (fn: () => () => void) => { effect = fn; },
};
const groepen: SourceGroup[] = [{
  id: "nl", label: "Nederland", total: 5, published: 7,
  sources: [
    { id: "a", key: "a", naam: "A", count: 2, fromData: false },
    { id: "b", key: "b", naam: "B", count: 0, fromData: false, stat: { vandaag: 0, laatste: "2026-10-30T10:30:00Z", ok: "2026-10-30T11:00:00Z", fout: "fout" } },
    { id: "c", key: "c", naam: "C", count: 1, fromData: false, stat: { vandaag: null, ok: "2026-10-29T10:00:00Z" } },
    { id: "d", key: "d", naam: "D", count: 0, fromData: false, stat: { vandaag: 3 } },
  ],
}];
const calls: unknown[] = [];
let gesloten = 0;
const props = { groups: groepen, weer: [{ site: "KNMI", href: "javascript:alert(1)" }], off: new Set(["b"]), setMany: (keys: string[], on: boolean) => calls.push([keys, on]), reset: () => calls.push("reset"), onClose: () => { gesloten++; } };
const render = () => SourcesSheet(props) as any;
function vind(node: any, pred: (n: any) => boolean): any[] {
  if (node == null || typeof node !== "object") return [];
  return [...(pred(node) ? [node] : []), ...React.Children.toArray(node.children ?? node.props?.children).flatMap((kind) => vind(kind, pred))];
}
const nodes = (root: any, type: any) => vind(root, (n) => n.type === type);
const tekst = (node: any): string => typeof node === "string" || typeof node === "number" ? String(node) : node == null ? "" : React.Children.toArray(node.children ?? node.props?.children).map(tekst).join("");

const root = render();
assert.equal(root.containerInfo, body);
assert.match(tekst(root), /1 bron uit/);
assert.match(tekst(root), /4 bronnen · 7 berichten vandaag/);
assert.match(tekst(root), /2 in overzicht/);
assert.match(tekst(root), /Vandaag niets · laatste 11:30 · bijgewerkt 12:00 · deels mislukt/);
assert.match(tekst(root), /Ophalen mislukt · laatst gelukt do 29 okt · 1 in overzicht/);
assert.match(tekst(root), /3 vandaag/);
assert.equal(nodes(root, "a")[0].props.href, undefined);
assert.equal(nodes(root, "a")[0].props.rel, "noreferrer");
const switches = nodes(root, Switch);
assert.equal(switches[0].props.checked, "mixed");
assert.equal(switches[2].props.checked, false);
switches[0].props.onChange(true);
switches[2].props.onChange(true);
assert.deepEqual(calls, [[['a', 'b', 'c', 'd'], true], [["b"], true]]);
const reset = nodes(root, "button").find((n) => tekst(n) === "Alles weer aan");
assert.equal(reset.props.disabled, false);
reset.props.onClick();
assert.equal(calls[2], "reset");
const opruimen = effect!();
assert.equal(body.style.overflow, "hidden");
assert.deepEqual(focus, ["sluiten"]);
venster.dispatchEvent(KeyboardEventStub("keydown", { key: "Escape" }));
function KeyboardEventStub(this: any, type: string, init: { key: string }) { const e = new Event(type); Object.defineProperty(e, "key", { value: init.key }); return e; }
assert.equal(closing, true);
assert.equal(timer?.ms, 360);
timer?.fn();
assert.equal(gesloten, 1);
const geslotenRoot = render();
const sheet = nodes(geslotenRoot, "div").find((n) => n.props.className === "sheet");
sheet.props.onAnimationEnd({ target: {} });
assert.equal(gesloten, 1);
sheet.props.onAnimationEnd({ target: paneel });
assert.equal(gesloten, 2);
opruimen();
assert.equal(body.style.overflow, "auto");
assert.deepEqual(focus, ["sluiten", "vorig"]);
minderBeweging = true;
const scrim = nodes(render(), "button").find((n) => n.props.className === "scrim");
scrim.props.onClick();
assert.equal(gesloten, 3);
console.log("sheet: tests geslaagd");
