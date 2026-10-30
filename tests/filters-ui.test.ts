import assert from "node:assert/strict";
import React from "react";
import { FilterBalk, FilterBlad, STANDAARD, useFilters, type Filters } from "../src/filters";
import type { Item } from "../src/types";

const g = globalThis as any;
const opslag = new Map<string, string>();
const store = { getItem: (k: string) => opslag.get(k) ?? null, setItem: (k: string, v: string) => opslag.set(k, v) };
g.localStorage = store;
g.sessionStorage = store;
const venster = new EventTarget() as any;
venster.matchMedia = () => ({ matches: true });
g.window = venster;
g.document = Object.assign(new EventTarget(), { body: { nodeType: 1 }, activeElement: { focus() {} }, visibilityState: "hidden" });
const dispatcher = (React as any).__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentDispatcher;
let effect: (() => void | (() => void)) | undefined;
dispatcher.current = {
  useState: (v: any) => [typeof v === "function" ? v() : v, (fn: any) => { if (typeof fn === "function") fn(STANDAARD); }],
  useRef: () => ({ current: { focus() {} } }),
  useCallback: (fn: any) => fn,
  useMemo: (fn: any) => fn(),
  useEffect: (fn: any) => { effect = fn; },
};
opslag.set("nieuwsinkort-filters", JSON.stringify({ tijd: "1u", cats: null, regio: null }));
opslag.set("nieuwsinkort-laatste-bezoek", "123");
const hook = useFilters();
assert.equal(hook.f.tijd, "1u");
assert.deepEqual(hook.f.cats, []);
assert.equal(hook.vorig, 123);
const opruimen = effect!();
g.document.dispatchEvent(new Event("visibilitychange"));
assert.ok(Number(opslag.get("nieuwsinkort-laatste-bezoek")) > 123);
hook.set({ video: true });
assert.equal(JSON.parse(opslag.get("nieuwsinkort-filters")!).video, true);
hook.reset();
assert.deepEqual(JSON.parse(opslag.get("nieuwsinkort-filters")!), STANDAARD);
if (typeof opruimen === "function") opruimen();

function vind(n: any, pred: (n: any) => boolean): any[] {
  if (!n || typeof n !== "object") return [];
  return [...(pred(n) ? [n] : []), ...React.Children.toArray(n.children ?? n.props?.children).flatMap((x) => vind(x, pred))];
}
function tekst(n: any): string {
  return typeof n === "string" || typeof n === "number" ? String(n) : !n ? "" : React.Children.toArray(n.children ?? n.props?.children).map(tekst).join("");
}
const item: Item = { kop: "Haarlem", tijd: "", cat: "haarlem", ai: "", samenvatting: "", punten: [], bronnen: [{ site: "NOS", href: "https://nos.nl/video/1" }, { site: "RTL", href: "https://rtl.nl/1" }] };
const wijzigingen: Partial<Filters>[] = [];
let gesloten = 0, resets = 0;
const u = { items: [item], tijd: "vandaag" as const, auto: true, per: { sinds: 1, vandaag: 1, "1u": 1, "3u": 1, alles: 1 }, nieuwSinds: 1 };
const props = { f: STANDAARD, set: (p: Partial<Filters>) => wijzigingen.push(p), reset: () => resets++, u, bron: [item], catBron: [item], vorig: 123, alles: true, onClose: () => gesloten++ };
const blad = FilterBlad(props) as any;
const chips = vind(blad, (n) => typeof n.type === "function" && n.type.name === "Chip");
for (const label of ["Laatste uur", "Haarlem", "Met video", "Uit meerdere bronnen", "Oudste eerst"]) {
  const chip = chips.find((n) => tekst(n).includes(label));
  assert.ok(chip, label);
  chip.props.onClick();
}
assert.deepEqual(wijzigingen, [{ tijd: "1u" }, { cats: ["haarlem"] }, { video: true }, { samen: true }, { sort: "oud" }]);
const regio = chips.filter((n) => tekst(n) === "Haarlem")[1];
regio.props.onClick();
assert.deepEqual(wijzigingen.at(-1), { regio: ["haarlem"] });
const knoppen = vind(blad, (n) => n.type === "button");
knoppen.find((n) => tekst(n) === "Standaard").props.onClick();
assert.equal(resets, 1);
knoppen.find((n) => n.props.className === "scrim").props.onClick();
assert.equal(gesloten, 1);
const videoBlad = FilterBlad({ ...props, video: true, vorig: 0, u: null }) as any;
assert.doesNotMatch(tekst(videoBlad), /Rubriek|Regio|Sinds je laatste bezoek/);
let geopend = 0;
const balk = FilterBalk({ u, f: { ...STANDAARD, video: true }, alles: true, onOpen: () => geopend++ });
assert.match(tekst(balk), /Vandaag1\+1 filter/);
vind(balk, (n) => n.type === "button")[0].props.onClick();
assert.equal(geopend, 1);
assert.match(tekst(FilterBalk({ u: null, f: STANDAARD, alles: false, onOpen() {} })), /Tijd: automatisch/);
dispatcher.current = null;
console.log("filterblad en opgeslagen keuzes: geslaagd");
