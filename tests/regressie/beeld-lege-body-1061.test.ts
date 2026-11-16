import assert from "node:assert/strict";
import { onRequest } from "../../functions/media/beeld/[[path]]";

const fetchOrigineel = globalThis.fetch;
const cacheOrigineel = (globalThis as any).caches;
const opgeslagen: string[] = [];
(globalThis as any).caches = { default: { match: async () => undefined, put: async (_k: Request, r: Response) => { opgeslagen.push(await r.text()); } } };
const vraag = (method = "GET") => onRequest({ request: new Request("https://nieuwsinkort.nl/media/beeld/images.nu.nl/voorbeeld.jpg", { method }) });
try {
  for (const antwoord of [
    () => new Response(null, { headers: { "content-type": "image/jpeg" } }),
    () => new Response("", { headers: { "content-type": "image/jpeg" } }),
    () => new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array(0)); c.close(); } }), { headers: { "content-type": "image/jpeg" } }),
  ]) {
    globalThis.fetch = (async () => antwoord()) as typeof fetch;
    const r = await vraag();
    assert.equal(r.status, 502);
    assert.equal(r.headers.get("cache-control"), "no-store");
    assert.deepEqual(opgeslagen, []);
  }
  const oudeSleutel = "https://nieuwsinkort.nl/__beeldcache/basis/images.nu.nl/voorbeeld.jpg";
  const oudeCache = new Map([[oudeSleutel, new Response("", { headers: { "content-type": "image/jpeg" } })]]);
  (globalThis as any).caches.default.match = async (sleutel: Request) => oudeCache.get(sleutel.url)?.clone();
  let opgehaald = 0;
  globalThis.fetch = (async () => { opgehaald++; return new Response("", { headers: { "content-type": "image/jpeg" } }); }) as typeof fetch;
  const oud = await vraag();
  assert.equal(opgehaald, 1, "een oude lege cache-entry wordt genegeerd");
  assert.equal(oud.status, 502);
  assert.equal(oud.headers.get("cache-control"), "no-store");
  assert.deepEqual(opgeslagen, []);
  globalThis.fetch = (async (_url, init) => new Response(init?.method === "HEAD" ? null : "beeld", { headers: { "content-type": "image/jpeg", "content-length": "5" } })) as typeof fetch;
  const head = await vraag("HEAD");
  assert.equal(head.status, 200);
  assert.equal(head.headers.get("content-length"), "5");
  assert.equal(await head.text(), "");
  const get = await vraag();
  assert.equal(get.status, 200);
  assert.equal(await get.text(), "beeld");
  assert.deepEqual(opgeslagen, ["beeld"]);
} finally {
  globalThis.fetch = fetchOrigineel;
  if (cacheOrigineel === undefined) delete (globalThis as any).caches; else (globalThis as any).caches = cacheOrigineel;
}
