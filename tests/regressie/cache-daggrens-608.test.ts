import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { artikelPad } from "../../src/artikelid";
import { onRequestGet as vandaag } from "../../functions/vandaag";
import { onRequestGet as sitemap } from "../../functions/sitemap-nieuws.xml";
import { onRequestGet as algemeneSitemap } from "../../functions/sitemap.xml";
import { onRequestGet as bericht } from "../../functions/bericht/[[pad]]";

const origineel = Date.now, vorigeCache = Object.getOwnPropertyDescriptor(globalThis, "caches");
const item = { kop: "Verdachten aangehouden", ai: "Eigen samenvatting", cat: "nl", t: Date.parse("2026-03-28T09:00:00Z"), bronnen: [{ site: "NOS", href: "https://nos.nl/a" }] };
const dag = "2026-03-28", pad = artikelPad(item, dag), opslag = new Map<string, Response>();
let nu = Date.parse("2026-03-28T22:59:30Z"), reads = 0, writes = 0;
Date.now = () => nu;
Object.defineProperty(globalThis, "caches", { configurable: true, value: { default: {
  match: async (r: Request) => opslag.get(r.url)?.clone(),
  put: async (r: Request, response: Response) => { opslag.set(r.url, response.clone()); },
} } });
const env = { ASSETS: { fetch: async (r: Request | string) => String((r as Request).url ?? r).endsWith("/data.json") ? Response.json({ gegenereerd: `${dag}T09:00:00Z`, items: [item] }) : new Response(readFileSync("index.html", "utf8"), { headers: { "Content-Type": "text/html", "CDN-Cache-Control": "max-age=3600", "Cloudflare-CDN-Cache-Control": "max-age=3600", Expires: "Wed, 01 Apr 2026 00:00:00 GMT" } }) }, NIEUWS: { get: async (key: string) => { reads++; return key === "data-vooraf" ? `${dag}\ntag\n${JSON.stringify({ gegenereerd: `${dag}T09:00:00Z`, items: [item] })}` : null; }, put: async () => { writes++; } } };
const vraag = async (route: typeof vandaag, url: string, headers?: Record<string, string>) => {
  const pending: Promise<unknown>[] = [];
  const r = await route({ request: new Request(`https://nieuwsinkort.nl${url}`, { headers }), env, waitUntil: (p) => { pending.push(p); } });
  await Promise.all(pending);
  return r;
};
try {
  for (const [route, url] of [[vandaag, "/vandaag"], [sitemap, "/sitemap-nieuws.xml"]] as const) {
    nu = Date.parse("2026-03-28T22:59:30Z");
    let r = await vraag(route, url);
    assert.match(await r.text(), /Verdachten aangehouden/);
    assert.equal(r.headers.get("cache-control"), "public, max-age=30");
    nu += 20000;
    const gelezen = reads;
    r = await vraag(route, url);
    assert.equal(reads, gelezen);
    assert.equal(r.headers.get("cache-control"), "public, max-age=10");
    nu = Date.parse("2026-03-28T23:00:00Z");
    await vraag(route, url);
    assert.ok(reads > gelezen, "middernacht vernieuwt cache");
    nu = Date.parse("2026-03-29T03:59:30Z");
    r = await vraag(route, url);
    assert.match(await r.text(), /Verdachten aangehouden/);
    assert.equal(r.headers.get("cache-control"), "public, max-age=30");
    nu = Date.parse("2026-03-29T04:00:00Z");
    r = await vraag(route, url);
    assert.doesNotMatch(await r.text(), /Verdachten aangehouden/);
  }
  nu = Date.parse("2026-03-29T03:58:00Z");
  let overzicht = await vraag(algemeneSitemap, "/sitemap.xml");
  assert.ok((await overzicht.text()).includes(pad));
  assert.equal(overzicht.headers.get("cache-control"), "public, max-age=120");
  nu += 60000;
  overzicht = await vraag(algemeneSitemap, "/sitemap.xml");
  assert.equal(overzicht.headers.get("cache-control"), "public, max-age=60");
  nu += 60000;
  overzicht = await vraag(algemeneSitemap, "/sitemap.xml");
  assert.ok(!(await overzicht.text()).includes(pad));
  assert.match(await (await vraag(algemeneSitemap, "/sitemap.xml")).text(), /\/over/);
  nu = Date.parse("2026-03-28T22:59:30Z");
  let middernacht = await vraag(bericht, pad);
  assert.equal(middernacht.status, 200);
  assert.equal(middernacht.headers.get("cache-control"), "public, max-age=30");
  nu = Date.parse("2026-03-28T23:00:00Z");
  middernacht = await vraag(bericht, pad);
  assert.equal(middernacht.status, 200);
  nu = Date.parse("2026-03-29T03:59:30Z");
  opslag.set(`https://nieuwsinkort.nl${pad}?versie=2`, new Response("oude cache", { headers: { "X-Geldig-Tot": String(nu + 300000), "Cache-Control": "public, max-age=300, stale-while-revalidate=600" } }));
  let r = await vraag(bericht, pad);
  assert.equal(r.status, 200);
  assert.match(await r.text(), /Verdachten aangehouden/);
  assert.equal(r.headers.get("cache-control"), "public, max-age=30");
  for (const naam of ["Expires", "CDN-Cache-Control", "Cloudflare-CDN-Cache-Control"]) assert.equal(r.headers.get(naam), null);
  const tag = r.headers.get("etag")!;
  nu += 20000;
  r = await vraag(bericht, pad, { "If-None-Match": tag });
  assert.equal(r.status, 304);
  assert.equal(r.headers.get("cache-control"), "public, max-age=10");
  nu = Date.parse("2026-03-29T04:00:00Z");
  r = await vraag(bericht, pad);
  assert.equal(r.status, 301);
  assert.equal(r.headers.get("location"), "/");
  assert.equal(writes, 0, "geen KV-schrijfacties");
} finally {
  Date.now = origineel;
  if (vorigeCache) Object.defineProperty(globalThis, "caches", vorigeCache);
  else Reflect.deleteProperty(globalThis, "caches");
}
