import assert from "node:assert/strict";
import { startAnalytics } from "../../src/analytics";

function proef(adres: string, begin: string | null, opslagWerkt = true) {
  let waarde = begin;
  let nieuwAdres = "";
  const scripts: { src: string; defer: boolean; attrs: Record<string, string> }[] = [];
  const meldingen: string[] = [];
  Object.assign(globalThis, {
    window: { location: { href: adres }, setTimeout: () => 0 },
    history: { state: null, replaceState: (_: unknown, __: string, url: string) => { nieuwAdres = url; } },
    localStorage: {
      getItem: () => { if (!opslagWerkt) throw Error(); return waarde; },
      setItem: (_: string, v: string) => { if (!opslagWerkt) throw Error(); waarde = v; },
      removeItem: () => { if (!opslagWerkt) throw Error(); waarde = null; },
    },
    document: {
      createElement: () => ({ src: "", defer: false, attrs: {} as Record<string, string>, style: { cssText: "" }, textContent: "", className: "", setAttribute(k: string, v: string) { this.attrs[k] = v; }, remove() {} }),
      head: { appendChild: (el: typeof scripts[number]) => scripts.push(el) },
      body: { appendChild: (el: { textContent: string }) => meldingen.push(el.textContent) },
    },
  });
  startAnalytics("test-token");
  return { waarde, nieuwAdres, scripts, meldingen };
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
