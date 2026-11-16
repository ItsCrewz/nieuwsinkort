// #1047: een respons met gisteren-filmpjes mag niet voorbij 10:00 Amsterdam gecachet blijven.
import assert from "node:assert/strict";
import { dagdata } from "../src/dagdata";
import { volgende10, videoCacheMs } from "../src/vandaag";

let n = 0;
const t = async (naam: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log("✓", naam); };
const iso = (s: string) => Date.parse(s);

await t("volgende10: zomer, winter en wisseldagen", () => {
  assert.equal(volgende10(iso("2026-07-01T09:58:00+02:00")), iso("2026-07-01T10:00:00+02:00"));
  assert.equal(volgende10(iso("2026-07-01T10:00:00+02:00")), iso("2026-07-02T10:00:00+02:00"));
  assert.equal(volgende10(iso("2026-01-15T09:58:00+01:00")), iso("2026-01-15T10:00:00+01:00"));
  assert.equal(volgende10(iso("2026-03-29T09:30:00+02:00")), iso("2026-03-29T10:00:00+02:00")); // wisseldag lente
  assert.equal(volgende10(iso("2026-03-28T12:00:00+01:00")), iso("2026-03-29T10:00:00+02:00"));
  assert.equal(volgende10(iso("2026-10-25T09:30:00+01:00")), iso("2026-10-25T10:00:00+01:00")); // wisseldag herfst
  assert.equal(volgende10(iso("2026-10-24T23:00:00+02:00")), iso("2026-10-25T10:00:00+01:00"));
});

await t("videoCacheMs: onbegrensd zonder terugval, anders tot 10:00", () => {
  const nu = iso("2026-07-01T09:58:00+02:00");
  assert.equal(videoCacheMs({ filmpjes: [{ t: 1 }], dumpert: [] }, nu), Infinity);
  assert.equal(videoCacheMs({ filmpjes: [{ gisteren: true }] }, nu), 120e3);
  assert.equal(videoCacheMs({ dumpert: [{ gisteren: true }] }, nu), 120e3);
});

const origineel = Date.now;
const draai = async (nu: string, kvTekst: string, extra: Record<string, string> = {}) => {
  Date.now = () => iso(nu);
  const env = { ASSETS: { fetch: async () => new Response("{}", { status: 404 }) }, NIEUWS: { get: async () => kvTekst } };
  return dagdata({ request: new Request("https://site.test/data.json", { headers: extra }), env } as any);
};
try {
  const gen = "2026-07-01T07:00:00+02:00";
  const data = (extra: any[]) => ({ gegenereerd: gen, items: [], dumpert: [], filmpjes: [
    { titel: "Gisteren", href: "https://youtu.be/aaaaaaaaaaa", t: iso("2026-06-30T20:00:00+02:00") }, ...extra] });
  const tekst = (d: any) => `2026-07-01\nx\n${JSON.stringify(d)}`;
  const vandaagV = { titel: "Vandaag", href: "https://youtu.be/bbbbbbbbbbb", t: iso("2026-07-01T10:30:00+02:00") };

  await t("09:58: gisteren-filmpjes met korte cache; 10:01 met dezelfde KV-tekst geen gisteren", async () => {
    const kv = tekst(data([]));
    let r = await draai("2026-07-01T09:58:00+02:00", kv);
    assert.equal((await r.json()).filmpjes.length, 1);
    assert.equal(r.headers.get("cache-control"), "public, max-age=0, s-maxage=60, stale-while-revalidate=60");
    r = await draai("2026-07-01T10:01:00+02:00", kv);
    assert.equal((await r.json()).filmpjes.length, 0);
    assert.match(r.headers.get("cache-control")!, /s-maxage=60, stale-while-revalidate=240/);
  });
  await t("09:59:30: s-maxage en swr samen niet voorbij 10:00", async () => {
    const r = await draai("2026-07-01T09:59:30+02:00", tekst({ ...data([]), uniek: 1 })); // eigen tekst: geheugen van een eerdere test (klok loopt terug) niet hergebruiken
    assert.equal(r.headers.get("cache-control"), "public, max-age=0, s-maxage=30, stale-while-revalidate=0");
  });
  await t("304 krijgt ook de begrensde kop", async () => {
    const kv = tekst({ ...data([]), uniek: 2 });
    const r1 = await draai("2026-07-01T09:58:00+02:00", kv);
    const r2 = await draai("2026-07-01T09:58:30+02:00", kv, { "If-None-Match": r1.headers.get("etag")! });
    assert.equal(r2.status, 304);
    assert.match(r2.headers.get("cache-control")!, /s-maxage=60, stale-while-revalidate=30/);
  });
  await t("vandaag-video's blijven na 10:00; zonder terugval ongewijzigde kop", async () => {
    const kv = tekst(data([vandaagV]));
    const r = await draai("2026-07-01T10:45:00+02:00", kv);
    const j = await r.json();
    assert.deepEqual(j.filmpjes.map((v: any) => v.titel), ["Vandaag"]);
    assert.equal(r.headers.get("cache-control"), "public, max-age=0, s-maxage=60, stale-while-revalidate=240");
  });
} finally { Date.now = origineel; }
console.log(`${n} tests ok`);
