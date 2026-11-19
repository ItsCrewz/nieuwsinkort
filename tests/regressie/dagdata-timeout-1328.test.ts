// Regressie #1328: hangende KV- of assetaanvragen mogen dagdata niet blokkeren.
import assert from "node:assert/strict";
import { dagdata, wacht } from "../../src/dagdata";
import { onRequestGet as vandaag } from "../../functions/vandaag";
import { onRequestGet as sitemapNieuws } from "../../functions/sitemap-nieuws.xml";
import { onRequestGet as dataJson } from "../../functions/data.json";
import { onRequestGet as bericht } from "../../functions/bericht/[[pad]]";
import { artikelPad } from "../../src/artikelid";
import { ams } from "../../src/tijd";

wacht.kv = 40; wacht.asset = 60;
const nooit = () => new Promise<any>(() => {});
const nu = new Date().toISOString();
const item = { kop: "Statisch", cat: "nl", t: Date.now() - 6e4, bronnen: [{ site: "Voorbeeld", href: "https://example.nl/a" }] };
const stat = JSON.stringify({ gegenereerd: nu, items: [item], filmpjes: [], dumpert: [] });
const assets = (signalen: AbortSignal[] = []) => ({ fetch: async (r: any) => { signalen.push(r.signal); return new Response(stat); } });
const hang = { get: nooit };
const req = (p = "/data.json") => new Request("https://nieuwsinkort.pages.dev" + p);

const main = async () => {
  // Hangende KV: statische fallback, niet blijven hangen.
  const r = await dagdata({ request: req(), env: { NIEUWS: hang, ASSETS: assets() } });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).items[0].kop, "Statisch");
  // Laat antwoord van uur overschrijft niets.
  let laat: (v: any) => void = () => {};
  const traag = { get: (k: string) => k === "uur" ? new Promise((ok) => { laat = ok; }) : Promise.resolve(null) };
  const r2 = await dagdata({ request: req(), env: { NIEUWS: traag, ASSETS: assets() } });
  laat({ gegenereerd: nu, items: [{ kop: "Laat", t: Date.now() - 6e4, bronnen: [] }] });
  assert.equal((await r2.json()).items[0].kop, "Statisch");
  // Hangende asset: annuleren en 503 no-store zonder uurdata.
  const sig: AbortSignal[] = [];
  const hangAsset = { fetch: (rq: any) => { sig.push(rq.signal); return nooit(); } };
  const r3 = await dagdata({ request: req(), env: { NIEUWS: { get: async () => null }, ASSETS: hangAsset } });
  assert.equal(r3.status, 503);
  assert.equal(r3.headers.get("Cache-Control"), "no-store");
  assert.ok(sig.length && sig.every((s) => s.aborted));
  // Hangende asset maar wel uurdata: uurdata wordt gebruikt.
  const uur = { get: async (k: string) => k === "uur" ? { gegenereerd: nu, items: [{ kop: "Uur", t: Date.now() - 6e4, bronnen: [{ href: "https://example.nl/u" }] }], filmpjes: [], dumpert: [] } : null };
  const r4 = await dagdata({ request: req(), env: { NIEUWS: uur, ASSETS: hangAsset } });
  assert.equal(r4.status, 200);
  // Statisch pad met hangende body.
  const hangBody = { fetch: async () => ({ ok: true, status: 200, text: nooit, json: nooit }) as any };
  const r5 = await dagdata({ request: req("/data.json?statisch=1"), env: { NIEUWS: hang, ASSETS: hangBody } });
  assert.equal(r5.status, 503);
  // Elke route bereikt dagdata en geeft bij twee hangende bronnen een tijdelijke fout.
  const routes = [
    { f: dataJson, pad: "/data.json" },
    { f: vandaag, pad: "/vandaag" },
    { f: sitemapNieuws, pad: "/sitemap-nieuws.xml" },
    { f: bericht, pad: artikelPad(item, ams().iso) },
  ];
  for (const { f, pad } of routes) {
    const ctx = { request: req(pad), env: { NIEUWS: hang, ASSETS: hangAsset }, waitUntil: () => {} };
    const res = await f(ctx);
    assert.equal(res.status, 503, pad);
    assert.equal(res.headers.get("Cache-Control"), "no-store", pad);
  }
  // Met hangende KV blijft de statische dataset beschikbaar, met de bestaande cacheheaders.
  const fallbackAssets = { fetch: async (r: Request) => new URL(r.url).pathname === "/data.json"
    ? new Response(stat) : new Response("<!doctype html><html><head></head><body></body></html>", { headers: { "Content-Type": "text/html" } }) };
  for (const { f, pad } of routes) {
    const res = await f({ request: req(pad), env: { NIEUWS: hang, ASSETS: fallbackAssets }, waitUntil: () => {} });
    assert.equal(res.status, 200, pad);
    assert.match(await res.text(), /Statisch/, pad);
    const cc = res.headers.get("Cache-Control") || "";
    if (pad === "/data.json") assert.equal(cc, "public, max-age=0, s-maxage=60, stale-while-revalidate=240");
    else {
      assert.match(cc, /^public, max-age=\d+/, pad);
      assert.ok(res.headers.get("X-Geldig-Tot"), pad);
    }
  }
  console.log("ok dagdata-timeout-1328");
};
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
