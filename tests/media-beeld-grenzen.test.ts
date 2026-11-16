import assert from "node:assert/strict";
import { acceptEmmer, cacheSleutel, onRequest, uitgesloten, upstreamAccept, upstreamUrl } from "../functions/media/beeld/[[path]]";

let n = 0;
const t = async (naam: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log("✓", naam); };

await t("beeld-URL bewaart toegestane escapes en query en weigert versluierde paden", () => {
  assert.equal(upstreamUrl("images.nu.nl/foto%20groot.jpg", "?width=400")?.href, "https://images.nu.nl/foto%20groot.jpg?width=400");
  for (const pad of ["images.nu.nl", "images.nu.nl/", "images.nu.nl/a%2Fb.jpg", "images.nu.nl/a%252fb.jpg", "images.nu.nl/a/../b.jpg", "images.nu.nl:443/a.jpg", "images.nu.nl.evil.test/a.jpg"]) {
    assert.equal(upstreamUrl(pad, ""), null, pad);
  }
  assert.equal(upstreamUrl("www.linda.nl/ander/foto.jpg", ""), null);
  assert.equal(upstreamUrl("www.linda.nl/wp-content/foto.jpg", "")?.hostname, "www.linda.nl");
});

await t("accept-onderhandeling respecteert expliciete uitsluitingen en formaten in cachesleutel", () => {
  const accept = "IMAGE/AVIF;q=0, image/webp;q=0.5, image/png;q=0";
  assert.equal(acceptEmmer(accept), "webp");
  assert.equal(uitgesloten(accept, "image/PNG; charset=utf-8"), true);
  assert.equal(upstreamAccept("webp", accept), "image/webp,image/jpeg,image/gif");
  assert.equal(acceptEmmer(null), "basis");
  const url = new URL("https://images.nu.nl/a.jpg?w=400");
  assert.equal(cacheSleutel("webp", url), "https://nieuwsinkort.nl/__beeldcache/v2/webp/images.nu.nl/a.jpg?w=400");
  assert.notEqual(cacheSleutel("webp", url), cacheSleutel("basis", url));
});

await t("ongeldige verzoeken worden zonder upstream-verzoek afgewezen", async () => {
  const origineel = globalThis.fetch;
  globalThis.fetch = (() => { throw new Error("onverwacht netwerkverzoek"); }) as typeof fetch;
  try {
    const post = await onRequest({ request: new Request("https://nieuwsinkort.nl/media/beeld/images.nu.nl/a.jpg", { method: "POST" }) });
    assert.equal(post.status, 405);
    assert.equal(post.headers.get("allow"), "GET, HEAD");
    const ongeldig = await onRequest({ request: new Request("https://nieuwsinkort.nl/media/beeld/voorbeeld.test/a.jpg") });
    assert.equal(ongeldig.status, 404);
    assert.equal(ongeldig.headers.get("cache-control"), "public, max-age=60");
    assert.equal(ongeldig.headers.get("x-content-type-options"), "nosniff");
  } finally { globalThis.fetch = origineel; }
});

console.log(`${n} tests geslaagd`);
