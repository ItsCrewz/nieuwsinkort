// Randgevallen van functions/meer.ts (onRequestGet): sleutel, KV-fout en cache-headers, met een nep-KV.
import assert from "node:assert/strict";
import { onRequestGet as meer } from "../functions/meer";

let n = 0;
const t = async (naam: string, fn: () => Promise<void>) => { await fn(); n++; console.log("✓", naam); };

const req = (pad: string) => new Request(`https://nieuws.example${pad}`);
const kvMet = (meerData: any) => ({ async get(_k: string, _o: any) { return meerData; } });
const kvFout = { async get(_k: string, _o: any): Promise<any> { throw new Error("KV down"); } };
const check = (r: Response, cache: string | null) => {
  assert.equal(r.headers.get("x-content-type-options"), "nosniff");
  assert.match(r.headers.get("content-type") || "", /^application\/json/);
  assert.equal(r.headers.get("access-control-allow-origin"), "*");
  assert.equal(r.headers.get("cache-control"), cache);
};

await t("geen sleutel, lege sleutel en te lange sleutel geven 400", async () => {
  const env = { NIEUWS: kvMet({ items: {} }) };
  for (const pad of ["/meer", "/meer?k=", `/meer?k=${"a".repeat(601)}`]) {
    const r = await meer({ request: req(pad), env });
    assert.equal(r.status, 400, pad);
    check(r, null);
    assert.deepEqual(await r.json(), { fout: "geen sleutel" });
  }
});

await t("sleutel van precies 600 tekens wordt nog opgezocht", async () => {
  const k = "a".repeat(600);
  const r = await meer({ request: req(`/meer?k=${k}`), env: { NIEUWS: kvMet({ items: { [k]: { uitleg: ["x"] } } }) } });
  assert.equal(r.status, 200);
});

await t("ontbrekende KV-binding geeft 400", async () => {
  const r = await meer({ request: req("/meer?k=bericht"), env: {} });
  assert.equal(r.status, 400);
  check(r, null);
});

await t("KV die een fout gooit geeft 404 met no-store", async () => {
  const err = console.error; console.error = () => {};
  try {
    const r = await meer({ request: req("/meer?k=bericht"), env: { NIEUWS: kvFout } });
    assert.equal(r.status, 404);
    check(r, "no-store");
    assert.deepEqual(await r.json(), { fout: "niet gevonden" });
  } finally { console.error = err; }
});

await t("onbekende sleutel, lege KV en zonder items geven 404 met no-store", async () => {
  for (const data of [{ items: { ander: { uitleg: ["x"] } } }, null, {}, { items: null }]) {
    const r = await meer({ request: req("/meer?k=bericht"), env: { NIEUWS: kvMet(data) } });
    assert.equal(r.status, 404);
    check(r, "no-store");
  }
});

await t("bekende sleutel geeft 200 met max-age=600 en beveiligingsheaders", async () => {
  const m = { uitleg: ["Extra tekst"], perBron: [{ site: "a.nl", href: "https://a.nl/x", punten: ["p"] }] };
  const r = await meer({ request: req("/meer?k=bericht"), env: { NIEUWS: kvMet({ items: { bericht: m } }) } });
  assert.equal(r.status, 200);
  check(r, "public, max-age=600");
  assert.deepEqual(await r.json(), m);
});

await t("sleutel met speciale tekens wordt gedecodeerd opgezocht", async () => {
  const k = "https://a.nl/x?y=1 &z";
  const r = await meer({ request: req(`/meer?k=${encodeURIComponent(k)}`), env: { NIEUWS: kvMet({ items: { [k]: { uitleg: ["ok"] } } }) } });
  assert.equal(r.status, 200);
});

await t("de meer-blob wordt per KV-binding 60 s hergebruikt (één KV-lezing/parse voor veel verzoeken)", async () => {
  let reads = 0;
  const kv = { async get(_k: string, _o: any) { reads++; return { items: { a: { uitleg: ["x"] } } }; } };
  const t0 = performance.now();
  for (let i = 0; i < 200; i++) {
    const r = await meer({ request: req("/meer?k=a"), env: { NIEUWS: kv } });
    assert.equal(r.status, 200);
  }
  assert.equal(reads, 1);
  assert.ok(performance.now() - t0 < 2000);
  const kv2 = { async get(_k: string, _o: any) { reads++; return { items: {} }; } };
  assert.equal((await meer({ request: req("/meer?k=a"), env: { NIEUWS: kv2 } })).status, 404);
  assert.equal(reads, 2);
});

console.log(`${n} meer-randgevallen-tests geslaagd`);
