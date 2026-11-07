// #607: gedeelde artikellink houdt zijn query; ?nietmeten=1 werkt dus ook op /bericht/… (routeomzetting vóór analytics, zoals main.tsx).
import assert from "node:assert/strict";
import { openGedeeld } from "../../src/gedeeldelink";
import { startAnalytics } from "../../src/analytics";

const pad = "/bericht/2026-11-01/abcd1234-een-kop";
function bezoek(pathname: string, search: string) {
  const stappen: string[] = [];
  let huidig = pathname + search;
  let hash = "";
  const zet = (u: string) => { const i = u.indexOf("#"); hash = i < 0 ? "" : u.slice(i); huidig = i < 0 ? u : u.slice(0, i); stappen.push(u); };
  const history = { state: null as unknown, replaceState: (_: unknown, __: string, u: string) => zet(u), pushState: (_: unknown, __: string, u: string) => zet(u) };
  const opslag: Record<string, string> = {};
  const scripts: unknown[] = [];
  const location = {
    get pathname() { return huidig.split("?")[0]; },
    get search() { const i = huidig.indexOf("?"); return i < 0 ? "" : huidig.slice(i); },
    get href() { return "https://voorbeeld.nl" + huidig + hash; },
  };
  Object.assign(globalThis, {
    window: { location, history, setTimeout: () => 0 },
    history,
    localStorage: { getItem: (k: string) => opslag[k] ?? null, setItem: (k: string, v: string) => { opslag[k] = v; }, removeItem: (k: string) => { delete opslag[k]; } },
    document: {
      querySelector: () => null,
      createElement: () => ({ style: {}, setAttribute() {}, remove() {} }),
      head: { appendChild: (e: unknown) => scripts.push(e) },
      body: { appendChild: () => {} },
    },
  });
  const w = (globalThis as unknown as { window: Parameters<typeof openGedeeld>[0] }).window;
  const open = openGedeeld(w);
  startAnalytics("test-token");
  return { open, stappen, opslag, scripts, adres: huidig + hash };
}

const uit = bezoek(pad, "?nietmeten=1&a=b%20c&q=%C3%A9%26x");
assert.equal(uit.open, true);
assert.equal(uit.opslag.nik_nietmeten, "1");
assert.equal(uit.scripts.length, 0);
assert.deepEqual(uit.stappen.slice(0, 2), ["/?nietmeten=1&a=b%20c&q=%C3%A9%26x#/", "/?nietmeten=1&a=b%20c&q=%C3%A9%26x#/bericht/abcd1234"]);
assert.equal(uit.adres, "/?a=b+c&q=%C3%A9%26x#/bericht/abcd1234"); // artikel geopend, nietmeten weg, rest gelijk (URLSearchParams schrijft %20 als +)

const zonder = bezoek(pad, "");
assert.deepEqual(zonder.stappen, ["/#/", "/#/bericht/abcd1234"]);
assert.equal(zonder.scripts.length, 1);

const direct = bezoek("/", "?x=1");
assert.equal(direct.open, false);
assert.equal(direct.stappen.length, 0);
assert.equal(bezoek("/bericht/kapot", "?x=1").open, false);
