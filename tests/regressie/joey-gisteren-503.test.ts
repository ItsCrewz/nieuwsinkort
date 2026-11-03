import assert from "node:assert/strict";
import * as dag from "../../src/vandaag";
const { alleenVandaag } = dag;

const ms = (s: string) => Date.parse(s);
const oud = { id: "oud", t: ms("2026-11-02T22:40:00Z") };
const vandaag = { id: "nieuw", t: ms("2026-11-03T05:00:00Z") };
const test = (nu: string, lijst: typeof oud[]) => dag.selecteerVideodag(lijst, ms(nu), (v) => v.t);
const zeven = "2026-11-03T06:00:00Z";
const data = (tijd: string, filmpjes: unknown[], dumpert: unknown[]) => ({ gegenereerd: tijd, items: [], filmpjes, dumpert });
const vroeg = alleenVandaag(data(zeven, [oud], [oud]), ms(zeven));
assert.deepEqual(vroeg.filmpjes, [{ ...oud, gisteren: true }]);
assert.deepEqual(test(zeven, [oud]), [{ ...oud, gisteren: true }]);
assert.deepEqual(test(zeven, [oud, vandaag]), [vandaag]);
assert.deepEqual(test("2026-11-03T09:30:00Z", [oud]), []);
assert.deepEqual(vroeg.dumpert, [{ ...oud, gisteren: true }]);
const gemengd = alleenVandaag(data(zeven, [oud, vandaag], [oud]), ms(zeven));
assert.deepEqual(gemengd.filmpjes, [vandaag]);
assert.deepEqual(gemengd.dumpert, [{ ...oud, gisteren: true }]);
assert.deepEqual(alleenVandaag(data("2026-11-03T08:50:00Z", vroeg.filmpjes, vroeg.dumpert), ms("2026-11-03T09:30:00Z")).dumpert, []);
const grens = [{ id: "gisteren", t: ms("2026-11-02T22:40:00Z") }, { id: "eergisteren", t: ms("2026-11-01T22:40:00Z") }];
assert.deepEqual(test("2026-11-02T23:30:00Z", grens), [{ ...grens[0], gisteren: true }]);
assert.equal(test("2026-11-03T08:59:00Z", [oud]).length, 1);
assert.equal(test("2026-11-03T09:00:00Z", [oud]).length, 0);
assert.equal(test("2026-07-03T07:59:00Z", [{ id: "zomer", t: ms("2026-07-02T21:40:00Z") }]).length, 1);
assert.equal(test("2026-07-03T08:00:00Z", [{ id: "zomer", t: ms("2026-07-02T21:40:00Z") }]).length, 0);
console.log("✓ videoterugval per Amsterdamse kalenderdag");
assert.deepEqual(alleenVandaag(data("2026-11-02T20:00:00Z", [oud], []), ms(zeven)).filmpjes, [{ ...oud, gisteren: true }]);

const oudeKlok = Date.now;
try {
  Date.now = () => ms(zeven);
  const { merge } = await import("../../functions/data.json");
  const { schoon } = await import("../../src/schoon");
  const { volgorde } = await import("../../worker/src/vooraf");
  const g = { ...oud, gisteren: true, href: "https://youtu.be/abcdefghijk", titel: "Een filmpje" };
  const n = { ...vandaag, href: "https://youtu.be/abcdefghijk", titel: "Een filmpje" };
  const S = data(zeven, [], [g]);
  const H = data(zeven, [], [n]);
  assert.deepEqual(merge(S, H).dumpert, [n]);
  assert.equal(schoon({ filmpjes: [n], dumpert: [g] }).filmpjes.length, 1);
  assert.equal(volgorde({ filmpjes: [g], dumpert: [g] }).length, 0);
} finally { Date.now = oudeKlok; }

const { videomoment } = await import("../../worker/src/videomoment");
const { uurInhoudVandaag } = await import("../../worker/src/opslag");
const nu = ms(zeven);
const moment = { dag: "2026-11-02", lijst: [oud] };
const toegestaan = () => true;
assert.deepEqual(videomoment([], moment, nu, toegestaan).lijst, [{ ...oud, gisteren: true }]);
assert.deepEqual(videomoment([], { ...moment, dag: "2026-11-01" }, nu, toegestaan).lijst, []);
assert.deepEqual(videomoment([], moment, ms("2026-11-03T09:00:00Z"), toegestaan).lijst, []);
assert.equal(videomoment([vandaag], moment, nu, toegestaan).lijst[0], vandaag);
assert.equal(videomoment([], moment, nu, toegestaan).bewaar, undefined);
const nieuwMoment = videomoment([vandaag], moment, nu, toegestaan).bewaar;
assert.ok(nieuwMoment);
assert.equal(videomoment([vandaag], nieuwMoment, nu, toegestaan).bewaar, undefined);
const hashBasis = { filmpjes: [], dumpert: [], items: [] };
const metTerugval = { ...hashBasis, filmpjes: videomoment([], moment, nu, toegestaan).lijst };
assert.equal(uurInhoudVandaag(hashBasis), uurInhoudVandaag(metTerugval));
assert.equal(uurInhoudVandaag(metTerugval), uurInhoudVandaag({ ...metTerugval, filmpjes: [{ ...oud, gisteren: true, views: 100 }] }));

try {
  Date.now = () => ms("2026-11-03T09:01:00Z");
  const { onRequestGet, etag } = await import("../../functions/data.json");
  const oudeBody = JSON.stringify(data(zeven, [{ ...oud, gisteren: true }], []));
  const vooraf = `2026-11-03\nhash\n${oudeBody}`;
  const env = { NIEUWS: { get: async () => vooraf }, ASSETS: { fetch: async () => { throw new Error("geen extra fetch"); } } };
  const antwoord = await onRequestGet({ request: new Request("https://voorbeeld.nl/data.json", { headers: { "If-None-Match": await etag(oudeBody) } }), env });
  assert.equal(antwoord.status, 200);
  assert.deepEqual((await antwoord.json()).filmpjes, []);
  const tag = antwoord.headers.get("ETag")!;
  const ongewijzigd = await onRequestGet({ request: new Request("https://voorbeeld.nl/data.json", { headers: { "If-None-Match": tag } }), env });
  assert.equal(ongewijzigd.status, 304);
} finally { Date.now = oudeKlok; }
