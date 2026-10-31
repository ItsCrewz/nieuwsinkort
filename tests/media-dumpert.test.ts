// Draai: npm test  (gedrag van de HLS-proxy functions/media/dumpert/[[path]].ts, zonder netwerk)
import assert from "node:assert/strict";
import { onRequest } from "../functions/media/dumpert/[[path]]";

let n = 0;
const t = async (name: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log("✓", name); };

const echteFetch = globalThis.fetch;
let aanroepen: { url: string; init: any }[] = [];
const mockFetch = (maak: () => Response) => {
  aanroepen = [];
  globalThis.fetch = (async (url: any, init: any) => { aanroepen.push({ url: String(url), init }); return maak(); }) as any;
};
const vraag = (path: string | string[] | undefined, method = "GET", headers: Record<string, string> = {}) =>
  onRequest({ request: new Request("https://nieuwsinkort.nl/media/dumpert/x", { method, headers }), params: { path } });

const LIJST = "dmp/media/video/ab12-cd/480/index.m3u8";
const STUK = "dmp/media/video/ab12-cd/480/seg-1.ts";

try {
  await t("andere methodes geven 405 met nosniff, zonder fetch", async () => {
    mockFetch(() => new Response("x"));
    const r = await vraag(LIJST, "POST");
    assert.equal(r.status, 405);
    assert.equal(r.headers.get("X-Content-Type-Options"), "nosniff");
    assert.equal(aanroepen.length, 0);
  });

  await t("niet-toegestane paden geven 404 zonder fetch", async () => {
    mockFetch(() => new Response("x"));
    for (const p of [undefined, "", "dmp/media/video/ab/x.exe", "andere/pad.m3u8", "dmp/media/video/../geheim/a.ts", "dmp/media/video/ZZ/a.ts", "dmp/media/video/ab/a.html"]) {
      const r = await vraag(p);
      assert.equal(r.status, 404, String(p));
      assert.equal(r.headers.get("X-Content-Type-Options"), "nosniff");
    }
    assert.equal(aanroepen.length, 0);
  });

  await t("padsegmenten als array worden samengevoegd", async () => {
    mockFetch(() => new Response("ok"));
    const r = await vraag(["dmp", "media", "video", "ab12", "480", "index.m3u8"]);
    assert.equal(r.status, 200);
    assert.equal(aanroepen[0].url, "https://media.dumpert.nl/dmp/media/video/ab12/480/index.m3u8");
  });

  await t("playlist: kort gecachet, upstream-opties en User-Agent", async () => {
    mockFetch(() => new Response("#EXTM3U", { headers: { "content-type": "application/vnd.apple.mpegurl", etag: "\"e\"" } }));
    const r = await vraag(LIJST);
    assert.equal(r.status, 200);
    assert.equal(await r.text(), "#EXTM3U");
    assert.equal(r.headers.get("Cache-Control"), "public, max-age=300, stale-while-revalidate=600");
    assert.equal(r.headers.get("Content-Type"), "application/vnd.apple.mpegurl");
    assert.equal(r.headers.get("ETag"), "\"e\"");
    assert.equal(r.headers.get("Access-Control-Allow-Origin"), "*");
    assert.equal(r.headers.get("X-Content-Type-Options"), "nosniff");
    assert.equal(aanroepen[0].url, `https://media.dumpert.nl/${LIJST}`);
    assert.equal(aanroepen[0].init.method, "GET");
    assert.equal(aanroepen[0].init.headers["User-Agent"], "Mozilla/5.0 (nieuwsinkort.nl)");
    assert.equal(aanroepen[0].init.cf.cacheTtlByStatus["200-299"], 300);
  });

  await t("videostuk: immutable en een jaar aan de rand", async () => {
    mockFetch(() => new Response("bytes"));
    const r = await vraag(STUK);
    assert.equal(r.headers.get("Cache-Control"), "public, max-age=31536000, immutable");
    assert.equal(aanroepen[0].init.cf.cacheTtlByStatus["200-299"], 31536000);
    assert.equal(aanroepen[0].init.cf.cacheTtlByStatus["500-599"], 0);
    assert.equal(aanroepen[0].init.cf.cacheEverything, true);
  });

  await t("Range gaat door naar upstream; range-headers komen terug", async () => {
    mockFetch(() => new Response("ab", { status: 206, headers: { "content-range": "bytes 0-1/10", "accept-ranges": "bytes", "content-length": "2", "set-cookie": "a=b" } }));
    const r = await vraag(STUK, "GET", { Range: "bytes=0-1" });
    assert.equal(aanroepen[0].init.headers.Range, "bytes=0-1");
    assert.equal(r.status, 206);
    assert.equal(r.headers.get("Content-Range"), "bytes 0-1/10");
    assert.equal(r.headers.get("Accept-Ranges"), "bytes");
    assert.equal(r.headers.get("Set-Cookie"), null);
  });

  await t("zonder Range-header geen Range upstream; HEAD blijft HEAD", async () => {
    mockFetch(() => new Response(null, { status: 200 }));
    await vraag(STUK, "HEAD");
    assert.equal(aanroepen[0].init.method, "HEAD");
    assert.equal("Range" in aanroepen[0].init.headers, false);
  });

  await t("upstream-fouten: status behouden en no-store", async () => {
    for (const status of [404, 503]) {
      mockFetch(() => new Response("nee", { status }));
      const r = await vraag(LIJST);
      assert.equal(r.status, status);
      assert.equal(r.headers.get("Cache-Control"), "no-store");
      assert.equal(r.headers.get("Access-Control-Allow-Origin"), "*");
    }
  });

  await t("hangende upstream: harde time-out geeft 504 no-store (nep-klok, geen netwerk)", async () => {
    const echteTimeout = globalThis.setTimeout;
    let ms = 0;
    globalThis.setTimeout = ((f: () => void, m: number) => { ms = m; queueMicrotask(f); return 0; }) as any;
    globalThis.fetch = ((_u: any, init: any) => new Promise((_ok, fout) => init.signal.addEventListener("abort", () => fout(new Error("abort"))))) as any;
    try {
      const r = await vraag(LIJST);
      assert.equal(r.status, 504);
      assert.equal(r.headers.get("Cache-Control"), "no-store");
      assert.equal(r.headers.get("X-Content-Type-Options"), "nosniff");
      assert.ok(ms > 0 && ms <= 10000);
    } finally { globalThis.setTimeout = echteTimeout; }
  });
} finally {
  globalThis.fetch = echteFetch;
}
console.log(`${n} tests ok`);
