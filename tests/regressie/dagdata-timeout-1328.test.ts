// Regressie #1328: hangende KV- of assetaanvragen mogen dagdata niet blokkeren.
import assert from "node:assert/strict";
import { dagdata, wacht } from "../../src/dagdata";
import { onRequestGet as vandaag } from "../../functions/vandaag";
import { onRequestGet as sitemapNieuws } from "../../functions/sitemap-nieuws.xml";
import { onRequestGet as dataJson } from "../../functions/data.json";

wacht.kv = 40; wacht.asset = 60;
const nooit = () => new Promise<any>(() => {});
const nu = new Date().toISOString();
const stat = JSON.stringify({ gegenereerd: nu, items: [{ kop: "Statisch", t: Date.now() - 6e4, bronnen: [{ href: "https://example.nl/a" }] }], filmpjes: [], dumpert: [] });
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
  // Genoemde routes hangen niet.
  for (const f of [vandaag, sitemapNieuws, dataJson] as any[]) {
    const res = await Promise.race([f({ request: req("/x"), env: { NIEUWS: hang, ASSETS: hangAsset }, params: {} }), new Promise((ok) => setTimeout(() => ok("hang"), 1500))]);
    assert.notEqual(res, "hang");
  }
  console.log("ok dagdata-timeout-1328");
};
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
