// Regressie #608: echte dagdata, vaste klok en een cache die oude antwoorden bewaart.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { artikelPad } from "../../src/artikelid";
import { onRequestGet as vandaag } from "../../functions/vandaag";
import { onRequestGet as sitemap } from "../../functions/sitemap-nieuws.xml";
import { onRequestGet as bericht } from "../../functions/bericht/[[pad]]";

const origineel = Date.now;
let tijd = 0;
Date.now = () => tijd;
const cache = new Map<string, Response>();
Object.defineProperty(globalThis, "caches", { configurable: true, value: { default: {
  match: async (r: Request) => cache.get(r.url)?.clone(),
  put: async (r: Request, res: Response) => { cache.set(r.url, res); },
} } });
const fixture = JSON.parse(readFileSync("public/data.json", "utf8"));
const origineelItem = fixture.items.find((i: any) => i.kop && i.bronnen?.length && !i.ruw && i.cat === "nl");
assert.ok(origineelItem);
const item = { ...origineelItem, t: Date.parse("2026-03-28T12:00:00Z") };
const sjabloon = readFileSync("index.html", "utf8");
const dag = "2026-03-28"; let reads = 0;
const env = { NIEUWS: { get: async () => { reads++; return `${dag}\ntag\n${JSON.stringify({ gegenereerd: `${dag}T12:00:00Z`, items: [item] })}`; } }, ASSETS: { fetch: async (r: Request | string) => String((r as Request).url ?? r).endsWith("/data.json") ? Response.json({}) : new Response(sjabloon, { headers: { "Content-Type": "text/html" } }) } };
const vraag = async (handler: typeof vandaag, pad: string) => {
  const pending: Promise<unknown>[] = [];
  const r = await handler({ request: new Request(`https://nieuwsinkort.nl${pad}`), env, waitUntil: (p) => { pending.push(p); } });
  await Promise.all(pending);
  return r;
};
try {
  // Zomertijd begint tussen deze middernacht en 06:00.
  tijd = Date.parse("2026-03-28T22:59:00Z");
  for (const [handler, pad] of [[vandaag, "/vandaag"], [sitemap, "/sitemap-nieuws.xml"]] as const) {
    const r = await vraag(handler, pad);
    assert.equal(r.headers.get("cache-control"), "public, max-age=60, must-revalidate");
    assert.ok((await r.text()).includes(artikelPad(item, dag)));
    const voor = reads; await vraag(handler, pad); assert.equal(reads, voor);
  }
  tijd = Date.parse("2026-03-28T23:00:00Z");
  for (const [handler, pad] of [[vandaag, "/vandaag"], [sitemap, "/sitemap-nieuws.xml"]] as const) {
    const voor = reads; await vraag(handler, pad); assert.ok(reads > voor, "nieuwe datasetperiode");
  }
  tijd = Date.parse("2026-03-29T03:59:00Z");
  const artikel = artikelPad(item, dag);
  let r = await vraag(bericht, artikel);
  assert.equal(r.status, 200); assert.equal(r.headers.get("cache-control"), "public, max-age=60, must-revalidate");
  for (const [handler, pad] of [[vandaag, "/vandaag"], [sitemap, "/sitemap-nieuws.xml"]] as const) {
    r = await vraag(handler, pad);
    assert.equal(r.headers.get("cache-control"), "public, max-age=60, must-revalidate");
  }
  tijd = Date.parse("2026-03-29T04:00:00Z");
  r = await vraag(bericht, artikel); assert.equal(r.status, 301); assert.equal(r.headers.get("location"), "/");
  for (const [handler, pad] of [[vandaag, "/vandaag"], [sitemap, "/sitemap-nieuws.xml"]] as const) {
    r = await vraag(handler, pad); assert.ok(!(await r.text()).includes(artikel));
  }
} finally { Date.now = origineel; delete (globalThis as any).caches; }
