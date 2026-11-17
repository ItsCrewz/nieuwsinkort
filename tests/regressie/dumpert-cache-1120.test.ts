import assert from "node:assert/strict";
import { onRequest } from "../../functions/media/dumpert/[[path]]";

const origineel = globalThis.fetch;
try {
  for (const methode of ["GET", "HEAD"]) {
    for (const [extensie, ttl, cache] of [
      ["m3u8", 300, "public, max-age=300, stale-while-revalidate=600"],
      ["M3U8", 300, "public, max-age=300, stale-while-revalidate=600"],
      ["M3u8", 300, "public, max-age=300, stale-while-revalidate=600"],
      ["ts", 31536000, "public, max-age=31536000, immutable"],
    ] as const) {
      const pad = `dmp/media/video/abc/720/test.${extensie}`;
      let aangeroepen = false;
      globalThis.fetch = (async (url: string | URL | Request, opties?: RequestInit) => {
        aangeroepen = true;
        assert.equal(url, `https://media.dumpert.nl/${pad}`);
        assert.equal(opties?.method, methode);
        assert.equal((opties as RequestInit & { cf: { cacheTtlByStatus: Record<string, number> } }).cf.cacheTtlByStatus["200-299"], ttl);
        return new Response(methode === "HEAD" ? null : "inhoud", { status: 200 });
      }) as typeof fetch;
      const antwoord = await onRequest({ request: new Request(`https://nieuwsinkort.test/media/dumpert/${pad}`, { method: methode }), params: { path: pad } });
      assert.ok(aangeroepen);
      assert.equal(antwoord.status, 200);
      assert.equal(antwoord.headers.get("Cache-Control"), cache);
      assert.equal(await antwoord.text(), methode === "HEAD" ? "" : "inhoud");
    }
  }
} finally {
  globalThis.fetch = origineel;
}
