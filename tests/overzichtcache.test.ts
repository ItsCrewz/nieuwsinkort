// Cachegeldigheid van /vandaag en /sitemap-nieuws.xml rond Amsterdamse middernacht en 06:00 (ook DST-wisseldagen); cache-double, vaste klok.
import assert from "node:assert/strict";
import { overzichtTtl, volgendeGrens } from "../src/overzichtcache";
import { onRequestGet as vandaag } from "../functions/vandaag";
import { onRequestGet as sitemap } from "../functions/sitemap-nieuws.xml";

const t = (iso: string) => Date.parse(iso);
const echteNu = Date.now;
const item = { kop: "Bericht", cat: "nl", t: t("2026-11-04T10:00:00Z"), bronnen: [{ href: "https://nos.nl/a" }] };
const opslag = new Map<string, Response>(); let puts = 0;
Object.defineProperty(globalThis, "caches", { configurable: true, value: { default: { match: async (r: Request) => opslag.get(r.url)?.clone(), put: async (r: Request, res: Response) => { puts++; opslag.set(r.url, res); } } } });
const pending: Promise<unknown>[] = [];
// KV geeft altijd het dagbestand van `gen` (vooraf-formaat: dag\ntag\njson)
const maak = (gen: string, reads = { n: 0 }) => ({ ASSETS: { fetch: async () => Response.json({}) }, NIEUWS: { get: async () => { reads.n++; return `${gen.slice(0, 10)}\ntag\n${JSON.stringify({ gegenereerd: gen, items: [{ ...item, t: t(gen) }] })}`; } } });
const vraag = (fn: any, pad: string, env: any) => fn({ request: new Request(`https://nieuwsinkort.nl${pad}`), env, waitUntil: (p: Promise<unknown>) => { pending.push(p); } });
const maxAge = (r: Response) => Number(/max-age=(\d+)/.exec(r.headers.get("cache-control")!)![1]);

try {
  // Helper: binnen de dag vol 300 s; vlak voor middernacht (CET: 23:00Z) en 06:00 (05:00Z) afgekapt.
  assert.equal(overzichtTtl(t("2026-11-04T12:00:00Z"), "2026-11-04T10:00:00Z"), 300);
  assert.equal(overzichtTtl(t("2026-11-04T22:57:30Z"), "2026-11-04T22:00:00Z"), 150);
  assert.equal(overzichtTtl(t("2026-11-04T23:00:00Z"), "2026-11-04T22:00:00Z"), 300, "na middernacht weer volle ttl (grens 06:00)");
  assert.equal(overzichtTtl(t("2026-11-05T04:58:00Z"), "2026-11-04T22:00:00Z"), 120, "vlak voor 06:00 dag D+1");
  assert.equal(volgendeGrens(t("2026-11-05T05:00:00Z"), "2026-11-04T22:00:00Z"), t("2026-11-05T23:00:00Z"), "na 06:00 volgende grens = middernacht");
  assert.equal(overzichtTtl(t("2026-11-05T12:00:00Z")), 300, "zonder datasetdag alleen middernacht");
  // DST-einde (25-uursdag 25-10-2026): middernacht 26-10 = 23:00Z, 06:00 CET = 05:00Z
  assert.equal(volgendeGrens(t("2026-10-25T10:00:00Z"), "2026-10-25T10:00:00Z"), t("2026-10-25T23:00:00Z"), "middernacht 26-10 (CET) = 23:00Z");
  assert.equal(volgendeGrens(t("2026-10-25T23:30:00Z"), "2026-10-25T10:00:00Z"), t("2026-10-26T05:00:00Z"));
  // zomertijd begint (23-uursdag 28-03-2027): midnight 28-03 = 23:00Z 27-03; 06:00 CEST op 29-03 = 04:00Z; middernacht 29-03 = 22:00Z 28-03
  assert.equal(volgendeGrens(t("2027-03-28T12:00:00Z"), "2027-03-28T12:00:00Z"), t("2027-03-28T22:00:00Z"));
  assert.equal(volgendeGrens(t("2027-03-28T22:30:00Z"), "2027-03-28T12:00:00Z"), t("2027-03-29T04:00:00Z"));
  // dag D = 27-03 (winter), D+1 = 28-03 (overgangsdag, 06:00 CEST = 04:00Z)
  assert.equal(volgendeGrens(t("2027-03-27T23:30:00Z"), "2027-03-27T12:00:00Z"), t("2027-03-28T04:00:00Z"));
  assert.equal(volgendeGrens(t("2026-10-24T22:30:00Z"), "2026-10-24T12:00:00Z"), t("2026-10-25T05:00:00Z"), "06:00 CET op de wisseldag zelf (na de overgang)");

  for (const [naam, fn, pad] of [["vandaag", vandaag, "/vandaag"], ["sitemap", sitemap, "/sitemap-nieuws.xml"]] as const) {
    for (const [dagGen, vlak, direct] of [
      ["2026-11-04T22:00:00Z", "2026-11-04T22:59:00Z", "2026-11-04T23:00:30Z"], // middernacht
      ["2026-11-04T22:00:00Z", "2026-11-05T04:59:00Z", "2026-11-05T05:00:30Z"], // 06:00
      ["2026-10-25T22:00:00Z", "2026-10-25T22:59:00Z", "2026-10-25T23:00:30Z"], // DST-einde: dag van 25 uur, 26-10 00:00 = 23:00Z
      ["2026-10-25T22:00:00Z", "2026-10-26T04:59:00Z", "2026-10-26T05:00:30Z"], // 06:00 CET na DST-einde
      ["2027-03-27T22:00:00Z", "2027-03-28T03:59:00Z", "2027-03-28T04:00:30Z"], // DST-begin: 06:00 CEST = 04:00Z
    ] as const) {
      opslag.clear(); puts = 0;
      const reads = { n: 0 };
      Date.now = () => t(vlak);
      let r = await vraag(fn, pad, maak(dagGen, reads)); await Promise.all(pending.splice(0));
      assert.equal(r.status, 200, `${naam} ${vlak}`);
      const ttl = maxAge(r);
      assert.ok(ttl >= 1 && ttl <= 60, `${naam} ${vlak}: ttl ${ttl} tot de grens`);
      assert.ok(!/stale-while-revalidate/.test(r.headers.get("cache-control")!), `${naam}: geen swr vlak voor een grens`);
      assert.equal(puts, 1);
      // binnen de geldigheid: uit cache (geen nieuwe KV-read, geen extra put)
      Date.now = () => t(vlak) + 500;
      const leesVoor = reads.n; r = await vraag(fn, pad, maak(dagGen, reads)); await Promise.all(pending.splice(0));
      assert.equal(reads.n, leesVoor, `${naam}: binnen geldigheid uit cache`); assert.equal(puts, 1);
      // na de grens: de oude entry telt niet meer, er komt een vers antwoord
      Date.now = () => t(direct);
      r = await vraag(fn, pad, maak(dagGen, reads)); await Promise.all(pending.splice(0));
      assert.ok(reads.n > leesVoor, `${naam} ${direct}: oude entry niet gebruikt`); assert.equal(puts, 2);
    }
    // midden op de dag: 300 s en behoud van caching
    opslag.clear(); Date.now = () => t("2026-11-04T12:00:00Z");
    const r = await vraag(fn, pad, maak("2026-11-04T10:00:00Z")); await Promise.all(pending.splice(0));
    assert.equal(maxAge(r), 300);
    // fout: geen data = 503 no-store, niets gecachet
    opslag.clear(); puts = 0;
    const f = await vraag(fn, pad, { ASSETS: { fetch: async () => new Response("", { status: 500 }) }, NIEUWS: { get: async () => null } }); await Promise.all(pending.splice(0));
    assert.equal(f.status, 503); assert.equal(f.headers.get("cache-control"), "no-store"); assert.equal(puts, 0);
  }
} finally { Date.now = echteNu; }
