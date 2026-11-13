import assert from "node:assert/strict";
import React from "react";
import { DeelBlok } from "../../src/detail";
import type { Item } from "../../src/types";

// Een kleine hook-stub laat Reacts ref-levenscyclus bij een her-render controleren.
const intern = React as unknown as { __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED: { ReactCurrentDispatcher: { current: unknown } } };
const dispatcher = intern.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentDispatcher;
const vorig = dispatcher.current;
const hooks: unknown[] = [];
let index = 0;
dispatcher.current = {
  useState(init: unknown) {
    const i = index++;
    if (!(i in hooks)) hooks[i] = init;
    return [hooks[i], (waarde: unknown) => { hooks[i] = waarde; }];
  },
  useRef(init: unknown) {
    const i = index++;
    if (!(i in hooks)) hooks[i] = { current: init };
    return hooks[i];
  },
  useCallback(fn: unknown) {
    const i = index++;
    if (!(i in hooks)) hooks[i] = fn;
    return hooks[i];
  },
  useEffect() { index++; },
};
const url = "https://nieuwsinkort.nl/bericht/test";
const item = { kop: "Testbericht" } as Item;
const render = () => {
  index = 0;
  return DeelBlok({ item, url }).props.children as (React.ReactElement & { ref: (el: unknown) => void })[];
};
const oudeNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
let pogingen = 0;
Object.defineProperty(globalThis, "navigator", { configurable: true, value: {
  share: async () => { pogingen++; throw new Error("geweigerd"); },
  clipboard: { writeText: async () => { pogingen++; throw new Error("geweigerd"); } },
} });
try {
  let kinderen = render();
  await kinderen[0].props.onClick();
  assert.equal(pogingen, 2);
  kinderen = render();
  assert.equal(kinderen[1].props.children, "Kopieer handmatig met Ctrl+C of Command+C.");
  const invoer = kinderen[2];
  assert.equal(invoer.props.value, url);
  assert.equal(invoer.props.readOnly, true);
  assert.equal(invoer.props["aria-describedby"], kinderen[1].props.id);
  let actief = "knop";
  let selectie = "";
  const veld = { focus() { actief = "invoer"; }, select() { selectie = url; } };
  (invoer.ref as (el: unknown) => void)(veld);
  assert.equal(actief, "invoer");
  assert.equal(selectie, url);
  actief = "volgend element"; // Tab, gevolgd door een her-render van de ouder.
  const opnieuw = render()[2];
  assert.equal(opnieuw.ref, invoer.ref);
  assert.equal(actief, "volgend element");
} finally {
  dispatcher.current = vorig;
  if (oudeNavigator) Object.defineProperty(globalThis, "navigator", oudeNavigator);
  else Reflect.deleteProperty(globalThis, "navigator");
}
