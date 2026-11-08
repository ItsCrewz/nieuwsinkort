import assert from "node:assert/strict";
import { onRequestGet } from "../../functions/bericht/[[pad]]";

const origineel = Date.now;
Date.now = () => Date.parse("2026-11-04T12:00:00Z");
try {
  let writes = 0;
  const oudCache = Object.getOwnPropertyDescriptor(globalThis, "caches");
  Object.defineProperty(globalThis, "caches", { configurable: true, value: { default: { match: async () => undefined, put: async () => { writes++; } } } });
  try {
    for (const body of ["{ongeldig", JSON.stringify({ gegenereerd: "ongeldig", items: [] }), JSON.stringify({ gegenereerd: "2026-11-04T12:00:00Z", items: {} }), JSON.stringify({ gegenereerd: "2026-11-03T12:00:00Z", items: [] }), "null"]) {
      const env = { ASSETS: { fetch: async () => new Response(body) } };
      const r = await onRequestGet({ request: new Request("https://nieuwsinkort.nl/bericht/2026-11-04/aaaaaaaa-onbekend"), env, waitUntil: () => { throw new Error("Onverwachte cachewrite"); } });
      assert.equal(r.status, 503, body);
      assert.equal(r.headers.get("cache-control"), "no-store");
      assert.equal(r.headers.get("location"), null);
    }
    assert.equal(writes, 0);
  } finally {
    if (oudCache) Object.defineProperty(globalThis, "caches", oudCache);
    else Reflect.deleteProperty(globalThis, "caches");
  }
} finally { Date.now = origineel; }
