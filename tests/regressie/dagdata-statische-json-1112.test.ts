import assert from "node:assert/strict";
import { dagdata } from "../../src/dagdata";

const geldig = { gegenereerd: new Date().toISOString(), items: [], filmpjes: [], dumpert: [] };
const kapotteBody = () => new Response(new ReadableStream({ start(controller) { controller.error(new Error("body afgebroken")); } }));
const vraag = (asset: () => Response, kv?: { get: (key: string) => Promise<unknown> }, statisch = false) => dagdata({
  request: new Request(`https://site.test/data.json${statisch ? "?statisch=1" : ""}`),
  env: { ASSETS: { fetch: async () => asset() }, NIEUWS: kv },
});

for (const asset of [() => new Response("{afgebroken"), kapotteBody]) {
  for (const statisch of [false, true]) {
    const r = await vraag(asset, statisch ? { get: async () => null } : undefined, statisch);
    assert.equal(r.status, 503);
    assert.equal(r.headers.get("cache-control"), "no-store");
    assert.equal(r.headers.get("retry-after"), "60");
  }
  const zonderUur = await vraag(asset, { get: async () => null });
  assert.equal(zonderUur.status, 503);
  assert.equal(zonderUur.headers.get("cache-control"), "no-store");
  assert.equal(zonderUur.headers.get("retry-after"), "60");
  const metUur = await vraag(asset, { get: async (key) => key === "uur" ? geldig : null });
  assert.equal(metUur.status, 200);
  assert.deepEqual((await metUur.json()).items, []);
}

for (const statisch of [false, true]) {
  const r = await vraag(() => Response.json(geldig), statisch ? { get: async () => null } : undefined, statisch);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), geldig);
}
const terugval = await vraag(() => Response.json(geldig), { get: async () => { throw new Error("KV onbereikbaar"); } });
assert.equal(terugval.status, 200);
assert.deepEqual((await terugval.json()).items, []);
console.log("✓ dagdata: ongeldige en onleesbare statische JSON wordt opgevangen");
