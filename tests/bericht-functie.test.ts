// functions/bericht/[[pad]].ts: basisheaders, 06:00-grens, id-matching, 503-paden, sjabloonterugval en succesheaders.
// Vaste klok, mocks voor KV, ASSETS en Cache API; geen netwerk. Aanvulling op bericht-pagina en bericht-routing.
import assert from "node:assert/strict";
import { artikelPad, linkId, oudeLinkId } from "../src/artikelid";
import { GELDIG_TOT } from "../src/overzichtcache";
import { onRequestGet } from "../functions/bericht/[[pad]]";

const echteNu = Date.now, echteCaches = Object.getOwnPropertyDescriptor(globalThis, "caches");
let klok = Date.parse("2026-11-04T12:00:00Z");
Date.now = () => klok;
const zet = (iso: string) => { klok = Date.parse(iso); };
const html = "<!doctype html><html><head><title>App</title></head><body><div id=\"root\"></div></body></html>";
const item = { kop: "Verdachten aangehouden", ai: "Eigen samenvatting", samenvatting: "Meer uitleg", punten: ["Punt"], cat: "nl", tijd: "10:00", bronnen: [{ site: "NOS", href: "https://nos.nl/a?x=1" }] };

// Cache API-mock (Node heeft geen caches.default)
const opslag = new Map<string, Response>(); let puts = 0;
Object.defineProperty(globalThis, "caches", { configurable: true, value: { default: { match: async (r: Request) => opslag.get(r.url)?.clone(), put: async (r: Request, res: Response) => { puts++; opslag.set(r.url, res); } } } });
const pending: Promise<unknown>[] = [];
const wu = (p: Promise<unknown>) => { pending.push(p); };

type Opties = { dag?: string; gegenereerd?: string; items?: unknown; kvFout?: boolean; ruwData?: unknown; sjabloon?: () => Response | Promise<Response>; sjabloonFout?: boolean; onderweg?: () => void };
const maakEnv = (o: Opties = {}) => {
  const dag = o.dag ?? "2026-11-04", tel = { kv: 0, assets: 0 };
  const data = "ruwData" in o ? o.ruwData : { gegenereerd: o.gegenereerd ?? `${dag}T09:00:00Z`, items: o.items ?? [item] };
  return {
    tel,
    ASSETS: { fetch: async (r: Request | string) => {
      tel.assets++;
      if (String((r as Request).url ?? r).endsWith("/data.json")) return Response.json({ items: [] });
      o.onderweg?.();
      if (o.sjabloonFout) throw new Error("assets stuk");
      return o.sjabloon ? o.sjabloon() : new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Content-Length": "999", "CDN-Cache-Control": "max-age=1", "X-Sjabloon": "ja" } });
    } },
    NIEUWS: { get: async (k: string) => { tel.kv++; if (o.kvFout) throw new Error("kv stuk"); return k === "data-vooraf" ? `${dag}\ntag\n${JSON.stringify(data)}` : null; } },
  };
};
const bezoek = (env: any, pad: string, headers: Record<string, string> = {}) => onRequestGet({ request: new Request(`https://nieuwsinkort.nl${pad}`, { headers }), env, waitUntil: wu } as any);
const basis = (r: Response, naam: string) => {
  assert.equal(r.headers.get("x-content-type-options"), "nosniff", naam); assert.equal(r.headers.get("x-frame-options"), "DENY", naam);
  assert.equal(r.headers.get("referrer-policy"), "strict-origin-when-cross-origin", naam); assert.equal(r.headers.get("strict-transport-security"), "max-age=604800", naam);
};
const dag = "2026-11-04", pad = artikelPad(item, dag);

try {
  // basisheaders en no-store op 404 en 503
  let r = await bezoek(maakEnv(), "/bericht/2026-11-04/kort-x");
  assert.equal(r.status, 404); assert.equal(r.headers.get("cache-control"), "no-store"); basis(r, "404"); assert.equal(await r.text(), "Niet gevonden");
  r = await bezoek(maakEnv(), "/bericht/2026-11-05/aaaaaaaa-x"); assert.equal(r.status, 404, "toekomst");
  r = await bezoek(maakEnv({ dag: "2026-11-03" }), pad);
  assert.equal(r.status, 503); assert.equal(r.headers.get("cache-control"), "no-store"); basis(r, "503"); assert.equal(await r.text(), "Data tijdelijk niet beschikbaar");

  // 503: KV-fout, andere dag, ongeldige data
  for (const [naam, o] of [
    ["kv-fout", { kvFout: true }], ["andere dag", { gegenereerd: "2026-11-03T09:00:00Z" }], ["geen datum", { ruwData: { items: [item] } }],
    ["ongeldige datum", { ruwData: { gegenereerd: "nooit", items: [item] } }], ["items geen lijst", { ruwData: { gegenereerd: `${dag}T09:00:00Z`, items: "x" } }], ["data null", { ruwData: null }],
  ] as [string, Opties][]) {
    opslag.clear(); r = await bezoek(maakEnv(o), pad); assert.equal(r.status, 503, naam); assert.equal(r.headers.get("cache-control"), "no-store", naam);
  }
  assert.equal(puts, 0, "fouten komen niet in de cache");

  // onbekend of dubbelzinnig id: 302 naar / met noindex, nooit gecachet
  for (const [naam, items] of [["onbekend", [item]], ["dubbel", [{ ...item, id: "aaaaaaaa" }, { ...item, id: "aaaaaaaa", kop: "Andere kop" }]]] as [string, unknown[]][]) {
    r = await bezoek(maakEnv({ items }), naam === "dubbel" ? "/bericht/2026-11-04/aaaaaaaa-kop" : "/bericht/2026-11-04/zzzzzzzz-kop");
    assert.equal(r.status, 302, naam); assert.equal(r.headers.get("location"), "/"); assert.equal(r.headers.get("cache-control"), "no-store"); assert.equal(r.headers.get("x-robots-tag"), "noindex"); basis(r, naam);
  }
  assert.equal(puts, 0);

  // linkId en oudeLinkId op een bron: 301 naar het canonieke pad, query blijft behouden
  const metId = { ...item, id: linkId("https://ander.nl/anker") }, canoniek = artikelPad(metId, dag), href = item.bronnen[0].href;
  for (const id of [linkId(href), oudeLinkId(href)]) {
    r = await bezoek(maakEnv({ items: [metId] }), `/bericht/${dag}/${id}-oud?utm=1`);
    assert.equal(r.status, 301, id); assert.equal(r.headers.get("location"), `${canoniek}?utm=1`); assert.equal(r.headers.get("cache-control"), "no-store"); assert.equal(r.headers.get("x-robots-tag"), null); basis(r, "301");
  }
  // een exacte id-treffer gaat vóór een bron-treffer
  const ander = { ...item, kop: "Andere", id: linkId(href), bronnen: [{ site: "X", href: "https://x.nl/z" }] };
  r = await bezoek(maakEnv({ items: [ander, { ...item, id: "bbbbbbbb" }] }), artikelPad(ander, dag)); assert.equal(r.status, 200);

  // gisteren: leeft tot 05:59 Amsterdam; daarna 301 met korte cache en behoud van query, zonder KV-read
  zet("2026-11-05T04:59:00Z"); r = await bezoek(maakEnv({ dag: "2026-11-04" }), pad); assert.equal(r.status, 200);
  zet("2026-11-05T05:00:00Z"); const envGrens = maakEnv(); r = await bezoek(envGrens, `${pad}?a=b`);
  assert.equal(r.status, 301); assert.equal(r.headers.get("location"), "/?a=b"); assert.equal(r.headers.get("cache-control"), "public, max-age=86400"); basis(r, "301 grens"); assert.equal(envGrens.tel.kv, 0);
  zet("2026-11-04T12:00:00Z"); opslag.clear();

  // terugval naar de hash-route: niet-html, niet-ok, ontbrekend, fetch-fout of body-fout; query blijft behouden
  const putsTerugval = puts, hash = `/?q=1#/bericht/${linkId(href)}`;
  const kapot = new Response(new ReadableStream({ start(c) { c.error(new Error("afgebroken")); } }), { headers: { "Content-Type": "text/html" } });
  for (const [naam, sjabloon] of [
    ["json", () => Response.json({})], ["404", () => new Response(html, { status: 404, headers: { "Content-Type": "text/html" } })],
    ["zonder type", () => new Response(html, { headers: { "Content-Type": "" } })], ["body-fout", () => kapot],
  ] as [string, () => Response][]) {
    r = await bezoek(maakEnv({ sjabloon }), `${pad}?q=1`); assert.equal(r.status, 302, naam); assert.equal(r.headers.get("location"), hash, naam); assert.equal(r.headers.get("cache-control"), "no-store"); assert.equal(r.headers.get("x-robots-tag"), "noindex");
  }
  r = await bezoek(maakEnv({ sjabloonFout: true }), `${pad}?q=1`); assert.equal(r.status, 302, "fetch-fout"); assert.equal(r.headers.get("location"), hash);
  assert.equal(puts, putsTerugval, "terugval komt niet in de cache");

  // succes: html, eigen headers, sjabloonheaders die niet kloppen verdwijnen, eigen cachebeleid
  opslag.clear(); const p0 = puts, env = maakEnv(); r = await bezoek(env, pad); await Promise.all(pending);
  assert.equal(r.status, 200); basis(r, "200"); assert.equal(r.headers.get("content-type"), "text/html; charset=utf-8");
  assert.equal(r.headers.get("cache-control"), "public, max-age=300, stale-while-revalidate=600"); assert.match(r.headers.get("etag")!, /^W\/"[0-9a-f]{40}"$/);
  assert.equal(r.headers.get("x-sjabloon"), "ja"); assert.equal(r.headers.get("content-length"), null); assert.equal(r.headers.get("cdn-cache-control"), null);
  assert.equal(Number(r.headers.get(GELDIG_TOT)), klok + 300e3);
  const tekst = await r.text(); assert.ok(tekst.includes(`https://nieuwsinkort.nl${pad}`)); assert.ok(tekst.includes("Verdachten aangehouden"));
  assert.equal(puts, p0 + 1); assert.equal(env.tel.assets, 1, "alleen het sjabloon: de data komt uit KV data-vooraf");
  const tag = r.headers.get("etag")!;

  // 304 bij passende ETag, ook vers gegenereerd; headers blijven staan en de body is leeg
  opslag.clear(); r = await bezoek(maakEnv(), pad, { "If-None-Match": tag }); await Promise.all(pending);
  assert.equal(r.status, 304); assert.equal(r.headers.get("etag"), tag); assert.equal(await r.text(), ""); basis(r, "304"); assert.equal(puts, p0 + 2, "304 wordt wel gecachet als 200");

  // verlopen cache-item (X-Geldig-Tot voorbij) wordt genegeerd: opnieuw uit KV
  opslag.clear(); await bezoek(maakEnv(), pad); await Promise.all(pending);
  klok += 301e3; const envNa = maakEnv(); r = await bezoek(envNa, pad); assert.equal(r.status, 200); assert.equal(envNa.tel.kv, 1, "verlopen item: opnieuw KV");
  zet("2026-11-04T12:00:00Z");

  // dataset verloopt tijdens het ophalen (06:00 gisteren): 301 naar / en niets in de cache
  opslag.clear(); const putsVoor = puts; zet("2026-11-05T04:59:59Z");
  r = await bezoek(maakEnv({ onderweg: () => zet("2026-11-05T05:00:01Z") }), `${pad}?z=1`);
  assert.equal(r.status, 301); assert.equal(r.headers.get("location"), "/?z=1"); assert.equal(r.headers.get("cache-control"), "public, max-age=86400"); await Promise.all(pending); assert.equal(puts, putsVoor);
} finally {
  Date.now = echteNu;
  if (echteCaches) Object.defineProperty(globalThis, "caches", echteCaches); else delete (globalThis as any).caches;
}
