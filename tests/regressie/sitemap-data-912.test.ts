// #912: tijdelijke fouten leveren geen geldige lege sitemap in de edge-cache op.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { onRequestGet } from "../../functions/sitemap-nieuws.xml";

const item = JSON.parse(readFileSync("tests/regressie/fixtures/artikel-bronnen-829.json", "utf8"));
const gegenereerd = "2026-11-04T10:00:00Z";
const geldig = JSON.stringify({ gegenereerd, items: [{ ...item, t: Date.parse("2026-11-04T09:00:00Z") }] });
const invoer = ["{", JSON.stringify({ items: [] }), JSON.stringify({ gegenereerd: "ongeldig", items: [] }), JSON.stringify({ gegenereerd }), JSON.stringify({ gegenereerd, items: null })];
const oudeTijd = Date.now;
const oudeCache = Object.getOwnPropertyDescriptor(globalThis, "caches");
try {
  Date.now = () => Date.parse("2026-11-04T12:00:00Z");
  for (const stuk of invoer) {
    let body = stuk, opgeslagen: Response | undefined, writes = 0;
    Object.defineProperty(globalThis, "caches", { configurable: true, value: { default: {
      match: async () => opgeslagen?.clone(),
      put: async (_: Request, antwoord: Response) => { writes++; opgeslagen = antwoord.clone(); },
    } } });
    const wachten: Promise<unknown>[] = [];
    const vraag = () => onRequestGet({ request: new Request("https://nieuwsinkort.nl/sitemap-nieuws.xml"), env: { ASSETS: { fetch: async () => new Response(body) } }, waitUntil: (p) => { wachten.push(p); } });
    const fout = await vraag();
    assert.equal(fout.status, 503, stuk);
    assert.equal(fout.headers.get("cache-control"), "no-store");
    assert.equal(fout.headers.get("retry-after"), "60");
    await Promise.all(wachten);
    assert.equal(writes, 0);
    body = geldig;
    const herstel = await vraag();
    assert.equal(herstel.status, 200);
    assert.match(await herstel.text(), /<news:title>/);
    await Promise.all(wachten);
    assert.equal(writes, 1);
  }
  let writes = 0;
  Object.defineProperty(globalThis, "caches", { configurable: true, value: { default: { match: async () => undefined, put: async () => { writes++; } } } });
  const wachten: Promise<unknown>[] = [];
  const leeg = await onRequestGet({ request: new Request("https://nieuwsinkort.nl/sitemap-nieuws.xml"), env: { ASSETS: { fetch: async () => Response.json({ gegenereerd, items: [] }) } }, waitUntil: (p) => { wachten.push(p); } });
  assert.equal(leeg.status, 200);
  assert.equal(leeg.headers.get("cache-control"), "public, max-age=300");
  assert.match(await leeg.text(), /<urlset[^>]*><\/urlset>/);
  await Promise.all(wachten);
  assert.equal(writes, 1);
} finally {
  Date.now = oudeTijd;
  if (oudeCache) Object.defineProperty(globalThis, "caches", oudeCache);
  else Reflect.deleteProperty(globalThis, "caches");
}
