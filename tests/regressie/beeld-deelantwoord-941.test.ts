import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { onRequest } from "../../functions/media/beeld/[[path]]";

// Een bestaande echte PNG dient als volledig beeld; de eerste respons bevat alleen een deel.
const beeld = await readFile("public/icon-48.png");
const opgeslagen = new Map<string, Response>();
const wacht: Promise<unknown>[] = [];
let aanvragen = 0;
const oudeFetch = globalThis.fetch;
const oudeCaches = (globalThis as any).caches;
(globalThis as any).caches = { default: {
  match: async (sleutel: Request) => opgeslagen.get(sleutel.url)?.clone(),
  put: async (sleutel: Request, antwoord: Response) => { const bytes = await antwoord.arrayBuffer(); opgeslagen.set(sleutel.url, new Response(bytes, { status: antwoord.status, headers: antwoord.headers })); },
} };
globalThis.fetch = (async (_url: unknown, init: RequestInit) => {
  assert.equal(new Headers(init.headers).get("range"), null);
  aanvragen++;
  return aanvragen === 1
    ? new Response(beeld.subarray(0, 16), { status: 206, headers: { "content-type": "image/png", "content-range": `bytes 0-15/${beeld.length}` } })
    : new Response(beeld, { status: 200, headers: { "content-type": "image/png", "content-length": String(beeld.length) } });
}) as typeof fetch;
try {
  const vraag = () => onRequest({ request: new Request("https://nieuwsinkort.nl/media/beeld/images.nu.nl/voorbeeld.png"), waitUntil: (p) => { wacht.push(p); } });
  const gedeeltelijk = await vraag();
  assert.equal(gedeeltelijk.status, 502);
  assert.equal(gedeeltelijk.headers.get("cache-control"), "no-store");
  assert.equal(opgeslagen.size, 0);
  const volledig = await vraag();
  assert.equal(volledig.status, 200);
  assert.deepEqual(Buffer.from(await volledig.arrayBuffer()), beeld);
  await Promise.all(wacht);
  assert.equal(opgeslagen.size, 1);
  assert.match([...opgeslagen.values()][0].headers.get("cache-control") || "", /public/);
  const hit = await vraag();
  assert.deepEqual(Buffer.from(await hit.arrayBuffer()), beeld);
  assert.equal(aanvragen, 2);
} finally {
  globalThis.fetch = oudeFetch;
  if (oudeCaches === undefined) delete (globalThis as any).caches;
  else (globalThis as any).caches = oudeCaches;
}
