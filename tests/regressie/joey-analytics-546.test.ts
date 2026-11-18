import assert from "node:assert/strict";
import { startAnalytics } from "../../src/analytics";

function proef(adres: string, begin: string | null, opslagWerkt: boolean | "stil" = true, bestaand = false, vensternaam = "") {
  let waarde = begin;
  let nieuwAdres = "";
  const scripts: { src: string; defer: boolean; attrs: Record<string, string> }[] = [];
  const meldingen: string[] = [];
  Object.assign(globalThis, {
    window: { name: vensternaam, location: { href: adres }, setTimeout: () => 0 },
    history: { state: null, replaceState: (_: unknown, __: string, url: string) => { nieuwAdres = url; } },
    localStorage: {
      getItem: () => { if (opslagWerkt === false) throw Error(); return waarde; },
      setItem: (_: string, v: string) => { if (opslagWerkt === false) throw Error(); if (opslagWerkt === true) waarde = v; },
      removeItem: () => { if (opslagWerkt === false) throw Error(); if (opslagWerkt === true) waarde = null; },
    },
    document: {
      querySelector: (selector: string) => {
        assert.match(selector, /script\[src\*="cloudflareinsights\.com"\]/);
        assert.match(selector, /script\[data-cf-beacon\]/);
        return bestaand ? {} : null;
      },
      createElement: () => ({ src: "", defer: false, attrs: {} as Record<string, string>, style: { cssText: "" }, textContent: "", className: "", setAttribute(k: string, v: string) { this.attrs[k] = v; }, addEventListener() {}, appendChild() {}, remove() {} }),
      head: { appendChild: (el: typeof scripts[number]) => scripts.push(el) },
      body: { appendChild: (el: { textContent: string }) => meldingen.push(el.textContent) },
    },
  });
  startAnalytics("test-token");
  return { waarde, nieuwAdres, scripts, meldingen, vensternaam: window.name };
}

assert.equal(proef("https://voorbeeld.nl/", "1").scripts.length, 0);
const normaal = proef("https://voorbeeld.nl/", null);
assert.equal(normaal.scripts[0].src, "https://static.cloudflareinsights.com/beacon.min.js");
assert.equal(normaal.scripts[0].defer, true);
assert.deepEqual(JSON.parse(normaal.scripts[0].attrs["data-cf-beacon"]), { token: "test-token" });
const uit = proef("https://voorbeeld.nl/?a=2&nietmeten=1#/sport", null);
assert.equal(uit.waarde, "1");
assert.equal(uit.nieuwAdres, "/?a=2#/sport");
assert.equal(uit.scripts.length, 0);
assert.equal(uit.meldingen[0], "Je bezoeken worden niet meer meegeteld");
const aan = proef("https://voorbeeld.nl/?nietmeten=0#/sport", "1");
assert.equal(aan.waarde, null);
assert.equal(aan.nieuwAdres, "/#/sport");
assert.equal(aan.scripts.length, 1);
assert.equal(aan.meldingen[0], "Je bezoeken worden weer meegeteld");
assert.equal(proef("https://voorbeeld.nl/", null, false).scripts.length, 1);
assert.equal(proef("https://voorbeeld.nl/", null, true, true).scripts.length, 0);
const geblokkeerd = proef("https://voorbeeld.nl/?nietmeten=1#/sport", null, false);
assert.equal(geblokkeerd.nieuwAdres, "");
assert.equal(geblokkeerd.scripts.length, 0);
assert.match(geblokkeerd.meldingen[0], /Opslag is geblokkeerd.*tabblad/);
assert.equal(proef("https://voorbeeld.nl/?nietmeten=1#/filmpjes", null, false).scripts.length, 0);
assert.equal(proef("https://voorbeeld.nl/?nietmeten=0#/sport", null, false).scripts.length, 1);
// #1254: stille opslag (bewaart niets) en gooiende opslag houden de opt-out in de URL.
for (const modus of ["stil", false] as const) {
  const r = proef("https://voorbeeld.nl/?a=2&nietmeten=1#/sport", null, modus);
  assert.equal(r.nieuwAdres, "", String(modus));
  assert.equal(r.scripts.length, 0);
  assert.equal(r.meldingen.length, 1);
  assert.match(r.meldingen[0], /Opslag is geblokkeerd/);
  assert.doesNotMatch(r.meldingen[0], /niet meer meegeteld/);
}
const nietBevestigd = proef("https://voorbeeld.nl/?nietmeten=0#/sport", "1", "stil");
assert.equal(nietBevestigd.scripts.length, 0);
assert.ok(nietBevestigd.meldingen.every((m) => !/weer meegeteld/.test(m)));

// De statische /over-pagina behoudt de vensternaam ook bij herladen en terugkeer.
for (const modus of ["stil", false] as const) {
  const start = proef("https://voorbeeld.nl/?nietmeten=1", null, modus);
  const bestemming = new URL("/over", "https://voorbeeld.nl");
  const herladen = new URL(bestemming.href);
  assert.equal(herladen.pathname, "/over");
  const terug = proef(new URL("/", herladen).href, null, modus, false, start.vensternaam);
  assert.equal(terug.scripts.length, 0);
  const opnieuw = proef("https://voorbeeld.nl/", null, modus, false, terug.vensternaam);
  assert.equal(opnieuw.scripts.length, 0);
  const aanzetten = proef("https://voorbeeld.nl/?nietmeten=0", null, modus, false, opnieuw.vensternaam);
  assert.equal(aanzetten.vensternaam, "");
  assert.equal(aanzetten.scripts.length, 1);
}
