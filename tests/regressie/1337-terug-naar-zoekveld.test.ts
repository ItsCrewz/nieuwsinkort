import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React, { createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server.browser";
import { Zoekbalk } from "../../src/zoekbalk";

const artikelen = JSON.parse(readFileSync("tests/fixtures/wolf-bram-feeds.json", "utf8")) as { t: string }[];
const term = artikelen[0].t.split(" ")[0];
const ref = createRef<HTMLInputElement>();
let focus = 0;
let wijzigingen = 0;
(ref as { current: unknown }).current = { focus: () => { focus++; } };
const props = { query: term, aantal: artikelen.length, invoer: ref, onChange: () => { wijzigingen++; } };
const html = renderToStaticMarkup(React.createElement(Zoekbalk, props));
assert.match(html, /aria-label="Terug naar zoekveld"/);
assert.match(html, /aria-controls=/);
assert.doesNotMatch(renderToStaticMarkup(React.createElement(Zoekbalk, { ...props, query: "" })), /Terug naar zoekveld/);

const dispatcher = (React as any).__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentDispatcher;
const vorige = dispatcher.current;
dispatcher.current = { useState: (waarde: unknown) => [waarde, () => {}], useId: () => "zoek", useEffect: () => {}, useRef: (waarde: unknown) => ({ current: waarde }), useCallback: (fn: unknown) => fn };
try {
  const balk = Zoekbalk(props);
  const knop = balk.props.children[0];
  assert.equal(knop.props.type, "button");
  knop.props.onClick();
  assert.equal(focus, 1);
  assert.equal(wijzigingen, 0);
} finally {
  dispatcher.current = vorige;
}
