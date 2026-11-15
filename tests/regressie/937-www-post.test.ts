import assert from "node:assert/strict";
import { onRequest } from "../../functions/_middleware";

const next = async () => new Response("ok");
const url = "https://www.nieuwsinkort.nl/samenvatting?video=123&taal=nl";
for (const method of ["GET", "HEAD"]) {
  const r = await onRequest({ request: new Request(url, { method }), next });
  assert.equal(r.status, 301);
  assert.equal(r.headers.get("location"), "https://nieuwsinkort.nl/samenvatting?video=123&taal=nl");
}

const body = JSON.stringify({ url: "https://www.youtube.com/watch?v=123" });
const request = new Request(url, { method: "POST", body, headers: { "Content-Type": "application/json" } });
const redirect = await onRequest({ request, next });
assert.equal(redirect.status, 308);
assert.equal(redirect.headers.get("location"), "https://nieuwsinkort.nl/samenvatting?video=123&taal=nl");
const vervolg = new Request(redirect.headers.get("location")!, request);
assert.equal(vervolg.method, "POST");
assert.equal(await vervolg.text(), body);

const pages = await onRequest({ request: new Request("https://nieuwsinkort.pages.dev/samenvatting?video=123", { method: "POST", body }), next });
assert.equal(pages.status, 200);
assert.equal(pages.headers.get("x-robots-tag"), "noindex");
