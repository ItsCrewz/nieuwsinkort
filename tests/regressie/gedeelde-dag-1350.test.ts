import assert from "node:assert/strict";
import { gedeeldeDagBeschikbaar, openGedeeld } from "../../src/gedeeldelink";

let state: unknown;
const adressen: string[] = [];
openGedeeld({
  location: { pathname: "/bericht/2026-11-01/abcd1234-een-kop", search: "?x=1" },
  history: {
    replaceState: (_s, _t, u) => { adressen.push(u); },
    pushState: (s, _t, u) => { state = s; adressen.push(u); },
  },
});
assert.deepEqual(state, { binnen: true, gedeeld: { dag: "2026-11-01", id: "abcd1234" } });
assert.deepEqual(adressen, ["/?x=1#/", "/?x=1#/bericht/abcd1234"]);
assert.equal(gedeeldeDagBeschikbaar("2026-11-01", "2026-11-01T22:59:00Z"), true);
assert.equal(gedeeldeDagBeschikbaar("2026-11-01", "2026-11-01T23:01:00Z"), false);
assert.equal(gedeeldeDagBeschikbaar("2026-11-01", undefined), false);
assert.equal(gedeeldeDagBeschikbaar(undefined, undefined), true);
