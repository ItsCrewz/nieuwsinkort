// /sitemap-nieuws.xml: dezelfde URL's als de berichtpagina, escaping, filters en lege dag; vaste klok, mocks, geen netwerk.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { artikelPad } from "../src/artikelid";
import { nieuwsSitemap, onRequestGet } from "../functions/sitemap-nieuws.xml";

const origineel = Date.now;
Date.now = () => Date.parse("2026-11-04T12:00:00Z");
try {
  const dag = "2026-11-04", t = Date.parse("2026-11-04T09:30:00Z");
  const a = { kop: "Rook & vuur <b>", ai: "x", t, cat: "nl", bronnen: [{ site: "NOS", href: "https://nos.nl/a" }] };
  const ruw = { kop: "Ruw bericht", ruw: true, t, bronnen: [{ site: "NOS", href: "https://nos.nl/r" }] };
  const pol = { kop: "Partijtekst", cat: "politiek", t, bronnen: [{ site: "NOS", href: "https://nos.nl/p" }] };
  const zonderT = { kop: "Zonder tijd", bronnen: [{ site: "NOS", href: "https://nos.nl/z" }] };
  const xml = nieuwsSitemap([a, ruw, pol, zonderT], dag);
  assert.ok(xml.includes(`<loc>https://nieuwsinkort.nl${artikelPad(a, dag)}</loc>`), "zelfde URL als de pagina");
  assert.ok(xml.includes("<news:title>Rook &amp; vuur &lt;b&gt;</news:title>"), "escaping");
  assert.ok(xml.includes("<news:publication_date>2026-11-04T09:30:00.000Z</news:publication_date>"));
  assert.ok(!xml.includes("lastmod"), "geen verzonnen lastmod (#712)");
  assert.ok(xml.includes("<news:language>nl</news:language>"));
  assert.equal((xml.match(/<url>/g) || []).length, 1, "ruw, politiek en zonder tijd ontbreken");
  const veel = Array.from({ length: 1200 }, (_, i) => ({ kop: `Bericht ${i}`, t, bronnen: [{ site: "x", href: `https://x.nl/${i}` }] }));
  assert.equal((nieuwsSitemap(veel, dag).match(/<url>/g) || []).length, 1000, "max 1000");
  assert.equal(nieuwsSitemap([], dag), '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"></urlset>\n');

  const data = (gegenereerd: string, items: unknown[]) => ({ ASSETS: { fetch: async () => Response.json({}) }, NIEUWS: { get: async () => `${dag}\ntag\n${JSON.stringify({ gegenereerd, items })}` } });
  const vraag = (env: any) => onRequestGet({ request: new Request("https://nieuwsinkort.nl/sitemap-nieuws.xml?x=1"), env, waitUntil: () => {} });
  let r = await vraag(data("2026-11-04T10:00:00Z", [a]));
  assert.equal(r.status, 200); assert.equal(r.headers.get("content-type"), "application/xml; charset=utf-8");
  assert.equal(r.headers.get("x-content-type-options"), "nosniff"); assert.equal(r.headers.get("cache-control"), "public, max-age=300");
  assert.equal(r.headers.get("strict-transport-security"), "max-age=604800");
  assert.ok((await r.text()).includes(artikelPad(a, dag)));
  r = await vraag(data("", [a])); assert.equal(r.status, 503);
  r = await vraag({ ASSETS: { fetch: async () => new Response("", { status: 500 }) }, NIEUWS: { get: async () => null } });
  assert.equal(r.status, 503); assert.equal(r.headers.get("cache-control"), "no-store");

  // cache over de Amsterdamse daggrens (#919): gewone dag en wintertijd-wisseldag, vaste klok + lokale cache-double
  const vorigeCache = Object.getOwnPropertyDescriptor(globalThis, "caches");
  const opslag = new Map<string, Response>();
  Object.defineProperty(globalThis, "caches", { configurable: true, value: { default: {
    match: async (q: Request) => opslag.get(q.url)?.clone(),
    put: async (q: Request, res: Response) => { opslag.set(q.url, res.clone()); },
  } } });
  try {
    for (const [d, voor, grens, zes] of [["2026-11-04", "2026-11-04T22:59:30Z", "2026-11-04T23:00:00Z", "2026-11-05T05:00:00Z"], ["2026-10-25", "2026-10-25T22:59:30Z", "2026-10-25T23:00:00Z", "2026-10-26T05:00:00Z"]]) {
      opslag.clear();
      const it = { ...a, t: Date.parse(`${d}T09:00:00Z`) };
      let reads = 0;
      const env = { ASSETS: { fetch: async () => Response.json({}) }, NIEUWS: { get: async () => { reads++; return `${d}\ntag\n${JSON.stringify({ gegenereerd: `${d}T09:00:00Z`, items: [it] })}`; } } };
      const pad = artikelPad(it, d);
      let nu = Date.parse(voor); Date.now = () => nu;
      r = await vraag(env);
      assert.equal(r.headers.get("cache-control"), "public, max-age=30", `${d}: begrensd tot de daggrens`);
      assert.ok((await r.text()).includes(pad));
      nu += 20000; const gelezen = reads;
      r = await vraag(env);
      assert.equal(reads, gelezen, `${d}: cachehit voor de grens`);
      assert.equal(r.headers.get("cache-control"), "public, max-age=10");
      nu = Date.parse(grens); r = await vraag(env);
      assert.ok(reads > gelezen, `${d}: na de grens opnieuw dagdata`);
      assert.equal(r.status, 200);
      nu = Date.parse(zes); r = await vraag(env);
      assert.ok(!(await r.text()).includes(pad), `${d}: oude dag valt na 06:00 weg`);
    }
  } finally {
    if (vorigeCache) Object.defineProperty(globalThis, "caches", vorigeCache); else Reflect.deleteProperty(globalThis, "caches");
  }

  // koppelingen: robots.txt noemt de sitemap, _routes.json sluit hem niet uit
  assert.ok(readFileSync("public/robots.txt", "utf8").includes("Sitemap: https://nieuwsinkort.nl/sitemap-nieuws.xml"));
  assert.ok(!JSON.parse(readFileSync("public/_routes.json", "utf8")).exclude.some((p: string) => p.includes("sitemap-nieuws")));
} finally { Date.now = origineel; }
