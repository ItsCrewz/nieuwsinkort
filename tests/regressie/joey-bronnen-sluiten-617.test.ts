import assert from "node:assert/strict";
import React from "react";
import { SourcesSheet } from "../../src/sheet";

// Werkelijke inhoud van de vaste weerbron, zonder netwerk of persoonsgegevens.
const props = { groups: [], weer: [{ site: "KNMI", href: "https://www.knmi.nl/" }], off: new Set<string>(), setMany: () => {}, reset: () => {}, onClose: () => { gesloten++; } };
let gesloten = 0;
let timer: (() => void) | undefined;
let gewist = 0;
const venster = new EventTarget() as any;
venster.matchMedia = () => ({ matches: false });
venster.setTimeout = (fn: () => void) => { timer = fn; return 1; };
venster.clearTimeout = (id?: number) => { if (id === 1) gewist++; };
(globalThis as any).window = venster;
(globalThis as any).document = { body: { nodeType: 1, style: {} }, activeElement: null };
const dispatcher = (React as any).__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentDispatcher;
let refs: any[] = [];
let index = 0;
let closing = false;
let effect: () => () => void;
const paneel = {};
dispatcher.current = {
  useState: () => [closing, (v: boolean) => { closing = v; }],
  useRef: (initial: unknown) => { const i = index++; return refs[i] ?? (refs[i] = { current: i === 0 ? paneel : i === 1 ? { focus() {} } : initial }); },
  useEffect: (fn: () => () => void) => { effect = fn; },
};
const render = () => { index = 0; return SourcesSheet(props) as any; };
function vind(node: any, pred: (n: any) => boolean): any[] {
  if (!node || typeof node !== "object") return [];
  return [...(pred(node) ? [node] : []), ...React.Children.toArray(node.children ?? node.props?.children).flatMap((kind) => vind(kind, pred))];
}
const knop = (root: any) => vind(root, (n) => n.props?.className === "scrim")[0];
const sheet = (root: any) => vind(root, (n) => n.props?.className === "sheet")[0];

let root = render();
const opruimen = effect!();
knop(root).props.onClick();
knop(root).props.onClick();
const oudeTimer = timer!;
root = render();
const oudeAnimatie = sheet(root).props.onAnimationEnd;
oudeAnimatie({ target: paneel });
assert.equal(gesloten, 1);
assert.equal(gewist, 1);
opruimen();
refs = [];
closing = false;
root = render();
const opnieuwOpruimen = effect!();
oudeTimer();
oudeAnimatie({ target: paneel });
assert.equal(gesloten, 1);
knop(root).props.onClick();
timer!();
assert.equal(gesloten, 2);
sheet(render()).props.onAnimationEnd({ target: paneel });
assert.equal(gesloten, 2);
opnieuwOpruimen();
console.log("bronnen sluiten: regressietest geslaagd");
