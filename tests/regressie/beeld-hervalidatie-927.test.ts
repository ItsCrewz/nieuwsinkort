import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { onRequest } from "../../functions/media/beeld/[[path]]";

const beeld = await readFile("public/icon-48.png");
const opgeslagen = new Map<string, Response>();
const oudeFetch = globalThis.fetch;
const oudeCaches = (globalThis as any).caches;
let aanvragen = 0;
(globalThis as any).caches = { default: {
  match: async (sleutel: Request) => opgeslagen.get(sleutel.url)?.clone(),
  put: async (sleutel: Request, antwoord: Response) => { const bytes = await antwoord.arrayBuffer(); opgeslagen.set(sleutel.url, new Response(bytes, { headers: antwoord.headers })); },
} };
globalThis.fetch = (async (_url: unknown, init: RequestInit) => {
  aanvragen++;
  const accept = new Headers(init.headers).get("accept") || "";
  const formaat = accept.includes("image/avif") ? "avif" : accept.includes("image/webp") ? "webp" : "png";
  return new Response(beeld, { headers: { "content-type": `image/${formaat}`, "content-length": String(beeld.length), etag: `"${formaat},1"`, "last-modified": "Wed, 21 Oct 2015 07:28:00 GMT" } });
}) as typeof fetch;
try {
  for (const formaat of ["avif", "webp", "png"]) {
    const accept = `image/${formaat}`;
    const vraag = (method = "GET", headers: Record<string, string> = {}) => onRequest({ request: new Request("https://nieuwsinkort.nl/media/beeld/images.nu.nl/voorbeeld.png", { method, headers: { accept, ...headers } }) });
    assert.equal((await vraag()).status, 200);
    for (const method of ["GET", "HEAD"]) {
      for (const headers of <Record<string, string>[]>[{ "If-None-Match": `"anders", W/"${formaat},1"` }, { "If-None-Match": "*" }, { "If-Modified-Since": "Wed, 21 Oct 2015 07:28:00 GMT" }]) {
        const r = await vraag(method, headers);
        assert.equal(r.status, 304);
        assert.equal(await r.text(), "");
        assert.equal(r.headers.get("etag"), `"${formaat},1"`);
        assert.equal(r.headers.get("vary"), "Accept");
        assert.equal(r.headers.get("cache-control"), "private, max-age=86400");
        assert.equal(r.headers.get("x-content-type-options"), "nosniff");
        assert.ok(r.headers.get("content-security-policy"));
        assert.equal(r.headers.get("content-length"), null);
      }
      for (const headers of <Record<string, string>[]>[{ "If-None-Match": '"anders"', "If-Modified-Since": "Wed, 21 Oct 2015 07:28:00 GMT" }, { "If-Modified-Since": "Tue, 20 Oct 2015 07:28:00 GMT" }, { "If-Modified-Since": "ongeldig" }]) {
        const r = await vraag(method, headers);
        assert.equal(r.status, 200);
        assert.equal(r.headers.get("content-type"), `image/${formaat}`);
        assert.deepEqual(Buffer.from(await r.arrayBuffer()), method === "HEAD" ? Buffer.alloc(0) : beeld);
      }
    }
  }
  assert.equal(aanvragen, 3);
} finally {
  globalThis.fetch = oudeFetch;
  if (oudeCaches === undefined) delete (globalThis as any).caches;
  else (globalThis as any).caches = oudeCaches;
}
