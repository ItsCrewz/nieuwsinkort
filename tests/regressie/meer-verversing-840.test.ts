// #840: /meer hervalideert (ETag/304) en de sessiecache ververst na VERS zonder dubbele aanvragen of verlies bij fouten.
import assert from "node:assert/strict";
import { onRequestGet as meerGet } from "../../functions/meer";
import { prefetchMeer } from "../../src/meer";
import type { Item } from "../../src/types";

let blob: any = { items: { a: { uitleg: ["oud"] } } };
let env = { NIEUWS: { get: async () => blob } }; // nieuwe binding = verse isolate (de functie bewaart de blob 60 s per binding)
const vraag = (h: Record<string, string> = {}) => meerGet({ request: new Request("https://x.nl/meer?k=a", { headers: h }), env });

// server: ETag volgt de inhoud, 304 alleen bij gelijke inhoud
let r = await vraag();
assert.equal(r.headers.get("Cache-Control"), "public, max-age=0, must-revalidate");
const tag = r.headers.get("ETag")!;
assert.ok(tag);
assert.equal((await vraag({ "If-None-Match": tag })).status, 304);
blob = { items: { a: { uitleg: ["nieuw"] } } };
env = { NIEUWS: { get: async () => blob } };
r = await vraag({ "If-None-Match": tag });
assert.equal(r.status, 200);
assert.notEqual(r.headers.get("ETag"), tag);

// client
const nu0 = Date.now, fetch0 = globalThis.fetch;
let klok = nu0.call(Date), calls = 0, tekst = "oud", stuk = false;
Date.now = () => klok;
globalThis.fetch = (async (_u: any, o: any) => {
  calls++;
  assert.equal(o?.cache, "no-cache");
  if (stuk) throw new Error("netwerk");
  return new Response(JSON.stringify({ uitleg: [tekst] }));
}) as any;
try {
  const item = { meer: "k840" } as Item;
  const p = prefetchMeer(item);
  assert.equal(prefetchMeer(item), p);
  assert.deepEqual((await p)?.uitleg, ["oud"]);
  tekst = "nieuw";
  assert.deepEqual((await prefetchMeer(item))?.uitleg, ["oud"], "binnen de versheid geen nieuwe aanvraag");
  assert.equal(calls, 1);
  klok += 6 * 60e3;
  const v = prefetchMeer(item);
  assert.equal(prefetchMeer(item), v, "gelijktijdige verversing deelt één aanvraag");
  assert.deepEqual((await v)?.uitleg, ["nieuw"]);
  assert.equal(calls, 2);
  // fout: laatste geldige antwoord blijft, volgende aanvraag probeert opnieuw
  klok += 6 * 60e3; stuk = true;
  assert.deepEqual((await prefetchMeer(item))?.uitleg, ["nieuw"]);
  stuk = false; tekst = "herstel";
  assert.deepEqual((await prefetchMeer(item))?.uitleg, ["herstel"]);
  assert.equal(calls, 4);
  console.log("ok - meer-verversing #840");
} finally { Date.now = nu0; globalThis.fetch = fetch0; }
