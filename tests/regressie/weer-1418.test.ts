import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server.browser";
import { WeatherBox } from "../../src/app-weer";
import { SourcesSheet } from "../../src/sheet";
import { valideer } from "../../src/valideer";

// Bestaande nieuwsdata met de vaste KNMI-bron, zonder netwerk.
const data = JSON.parse(readFileSync("public/data.json", "utf8"));
const bron = { site: "KNMI", href: "https://www.knmi.nl/" };
(globalThis as any).document = { body: { nodeType: 1 } };
const dispatcher = (React as any).__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentDispatcher;
for (const waarde of [undefined, null, {}, "ongeldig", 42]) {
  const uit = valideer({ ...data, weer: { nu: { temp: 12 }, dagen: waarde, bronnen: waarde } }).data;
  assert.deepEqual(uit.items, data.items);
  assert.equal(uit.weer.nu?.temp, 12);
  assert.doesNotThrow(() => renderToStaticMarkup(React.createElement(WeatherBox, { W: uit.weer, bionic: false })));
  dispatcher.current = { useState: () => [false, () => {}], useRef: (v: unknown) => ({ current: v }), useEffect: () => {} };
  assert.doesNotThrow(() => SourcesSheet({ groups: [], weer: uit.weer.bronnen ?? [], off: new Set<string>(), setMany: () => {}, reset: () => {}, onClose: () => {} }));
  dispatcher.current = null;
}
for (const waarde of [undefined, null, [], "ongeldig", 42]) {
  const uit = valideer({ ...data, weer: waarde }).data;
  assert.deepEqual(uit.weer, {});
  assert.deepEqual(uit.items, data.items);
}
const uit = valideer({ ...data, weer: { dagen: [{ dag: "ma", min: 5 }, null], bronnen: [bron, null] } }).data;
assert.deepEqual(uit.weer.dagen, [{ dag: "ma", min: 5 }]);
assert.deepEqual(uit.weer.bronnen, [bron]);
console.log("✓ ongeldige weersverwachting blokkeert de feed niet (#1418)");
