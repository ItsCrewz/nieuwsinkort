// #599: ongeldige dagdata mag geen lege SEO-pagina in de cache plaatsen.
import assert from "node:assert/strict";
import { onRequestGet as sitemap } from "../functions/sitemap-nieuws.xml";
import { onRequestGet as vandaag } from "../functions/vandaag";

const geldig = { gegenereerd: "2026-11-04T10:00:00Z", items: [{ kop: "Testbericht", cat: "nl", t: Date.parse("2026-11-04T09:00:00Z"), bronnen: [{ href: "https://nos.nl/bericht" }] }] };
const ongeldig = ["{", "null", JSON.stringify({ items: [] }), JSON.stringify({ gegenereerd: "ongeldig", items: [] }), JSON.stringify({ gegenereerd: 123, items: [] }), JSON.stringify({ gegenereerd: geldig.gegenereerd }), JSON.stringify({ gegenereerd: geldig.gegenereerd, items: {} })];
const vorigeCache = Object.getOwnPropertyDescriptor(globalThis, "caches");
const echteNu = Date.now;
Date.now = () => Date.parse("2026-11-04T10:30:00Z"); // vaste klok: de dagdata moet van de huidige Amsterdamse dag zijn (#608)
try {
  for (const [pad, route] of [["/vandaag", vandaag], ["/sitemap-nieuws.xml", sitemap]] as const) {
    for (const invoer of ongeldig) {
      let body = invoer, writes = 0;
      const opslag = new Map<string, Response>();
      Object.defineProperty(globalThis, "caches", { configurable: true, value: { default: {
        match: async (r: Request) => opslag.get(r.url)?.clone(),
        put: async (r: Request, response: Response) => { writes++; opslag.set(r.url, response.clone()); },
      } } });
      const wachten: Promise<unknown>[] = [];
      const vraag = () => route({ request: new Request(`https://nieuwsinkort.nl${pad}?x=1`), env: { ASSETS: { fetch: async () => new Response(body) } }, waitUntil: (p) => { wachten.push(p); } });
      const fout = await vraag();
      assert.equal(fout.status, 503, `${pad}: ${invoer}`);
      assert.equal(fout.headers.get("cache-control"), "no-store");
      assert.equal(fout.headers.get("retry-after"), "60");
      assert.equal(writes, 0);
      body = JSON.stringify(geldig);
      const herstel = await vraag();
      assert.equal(herstel.status, 200);
      assert.match(await herstel.text(), /Testbericht/);
      await Promise.all(wachten);
      assert.equal(writes, 1);
      body = invoer;
      assert.match(await (await vraag()).text(), /Testbericht/, "geldig antwoord blijft in cache");
      assert.equal(writes, 1);
    }
    Object.defineProperty(globalThis, "caches", { configurable: true, value: undefined });
    const leeg = await route({ request: new Request(`https://nieuwsinkort.nl${pad}`), env: { ASSETS: { fetch: async () => Response.json({ ...geldig, items: [] }) } }, waitUntil: () => {} });
    assert.equal(leeg.status, 200);
    assert.match(await leeg.text(), pad === "/vandaag" ? /nog geen berichten/ : /<urlset[^>]*><\/urlset>/);
  }
} finally {
  Date.now = echteNu;
  if (vorigeCache) Object.defineProperty(globalThis, "caches", vorigeCache);
  else Reflect.deleteProperty(globalThis, "caches");
}
