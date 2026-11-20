// #1339: alle toegestane berichten blijven via de index bereikbaar, ook met cache en daggrens.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { onRequestGet } from "../../functions/sitemap-nieuws.xml";
import { artikelPad } from "../../src/artikelid";

const item = JSON.parse(readFileSync("tests/regressie/fixtures/artikel-bronnen-829.json", "utf8"));
const dag = "2026-11-04", gegenereerd = `${dag}T09:00:00Z`;
const items = Array.from({ length: 1201 }, (_, i) => ({ ...item, kop: `Bericht ${i}`, t: Date.parse(gegenereerd), bronnen: [{ href: `https://nos.nl/artikel/${i}` }] }));
const oudeTijd = Date.now, oudeCache = Object.getOwnPropertyDescriptor(globalThis, "caches");
let nu = Date.parse("2026-11-04T22:59:30Z"), body = JSON.stringify({ gegenereerd, items: [...items, { ...items[0], ruw: true }, { ...items[0], t: null }, items[0]] });
const opslag = new Map<string, Response>(), wachten: Promise<unknown>[] = [];
try {
  Date.now = () => nu;
  Object.defineProperty(globalThis, "caches", { configurable: true, value: { default: {
    match: async (q: Request) => opslag.get(q.url)?.clone(),
    put: async (q: Request, r: Response) => { opslag.set(q.url, r.clone()); },
  } } });
  const vraag = (pad: string) => onRequestGet({ request: new Request(`https://nieuwsinkort.nl${pad}`), env: { ASSETS: { fetch: async () => new Response(body) } }, waitUntil: (p) => { wachten.push(p); } });
  const index = await vraag("/sitemap-nieuws.xml");
  assert.equal(index.headers.get("cache-control"), "public, max-age=30");
  const links = [...(await index.text()).matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => new URL(m[1]).pathname + new URL(m[1]).search);
  assert.deepEqual(links, ["/sitemap-nieuws.xml?deel=1", "/sitemap-nieuws.xml?deel=2"]);
  const urls: string[] = [];
  for (const link of links) {
    const antwoord = await vraag(link);
    assert.equal(antwoord.headers.get("cache-control"), "public, max-age=30");
    urls.push(...[...(await antwoord.text()).matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]));
  }
  assert.equal(urls.length, 1201);
  assert.equal(new Set(urls).size, 1201);
  for (const bericht of items) assert.ok(urls.includes(`https://nieuwsinkort.nl${artikelPad(bericht, dag)}`));
  await Promise.all(wachten);
  assert.equal(opslag.size, 3);
  nu = Date.parse("2026-11-05T05:00:00Z");
  assert.doesNotMatch(await (await vraag(links[1])).text(), /<url>/);
  opslag.clear(); body = "{";
  const fout = await vraag(links[0]);
  assert.equal(fout.status, 503);
  assert.equal(fout.headers.get("cache-control"), "no-store");
  await Promise.all(wachten);
  assert.equal(opslag.size, 0);
} finally {
  Date.now = oudeTijd;
  if (oudeCache) Object.defineProperty(globalThis, "caches", oudeCache); else Reflect.deleteProperty(globalThis, "caches");
}
