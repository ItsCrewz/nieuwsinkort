import assert from "node:assert/strict";
import { onRequestGet } from "../../functions/bericht/[[pad]]";
import { startAnalytics } from "../../src/analytics";

const origineelNu = Date.now;
const pad = "/bericht/2026-11-04/abcd1234-een-kop";
const query = "?nietmeten=1&a=b%20c&volgende=https%3A%2F%2Fkwaad.example%2F";
const env = { ASSETS: { fetch: async () => Response.json({ gegenereerd: "2026-11-04T10:00:00Z", items: [] }) } };
const bezoek = (zoek: string) => onRequestGet({ request: new Request(`https://nieuwsinkort.nl${pad}${zoek}`), env, waitUntil: () => {} });

try {
  Date.now = () => Date.parse("2026-11-05T04:59:00Z");
  assert.equal((await bezoek(query)).status, 302);
  Date.now = () => Date.parse("2026-11-05T05:00:00Z");
  const antwoord = await bezoek(query);
  assert.equal(antwoord.status, 301);
  assert.equal(antwoord.headers.get("location"), `/${query}`);
  assert.equal(antwoord.headers.get("cache-control"), "public, max-age=86400");
  assert.equal(new URL(antwoord.headers.get("location")!, "https://nieuwsinkort.nl").origin, "https://nieuwsinkort.nl");
  assert.equal((await bezoek("")).headers.get("location"), "/");
  assert.equal((await bezoek("?//kwaad.example")).headers.get("location"), "/?//kwaad.example");

  let voorkeur = "";
  let adres = "";
  const scripts: unknown[] = [];
  Object.assign(globalThis, {
    window: { location: { href: new URL(antwoord.headers.get("location")!, "https://nieuwsinkort.nl").href }, setTimeout: () => 0 },
    history: { state: null, replaceState: (_: unknown, __: string, url: string) => { adres = url; } },
    localStorage: { getItem: () => voorkeur, setItem: (_: string, waarde: string) => { voorkeur = waarde; } },
    document: {
      querySelector: () => null,
      createElement: () => ({ style: {}, setAttribute() {}, remove() {} }),
      head: { appendChild: (script: unknown) => scripts.push(script) },
      body: { appendChild: () => {} },
    },
  });
  startAnalytics("test-token");
  assert.equal(voorkeur, "1");
  assert.equal(scripts.length, 0);
  assert.equal(adres, "/?a=b+c&volgende=https%3A%2F%2Fkwaad.example%2F");
} finally { Date.now = origineelNu; }
