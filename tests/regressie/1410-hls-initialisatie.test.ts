import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { HLS_BYTES, segmentenBereik, voerUit, type Plan } from "../../src/voorladen";

const playlist = readFileSync("tests/regressie/fixtures/voorladen-1410/media.m3u8", "utf8");
const basis = "https://video.example/map/media.m3u8";
assert.deepEqual(segmentenBereik(playlist, basis), [
  { url: "https://video.example/init.mp4", bereik: { van: 20, tot: 119 } },
  { url: "https://video.example/map/segment1.m4s" },
]);
assert.deepEqual(segmentenBereik('#EXT-X-MAP:URI="init.mp4",BYTERANGE="ongeldig"\na.m4s', basis), [{ url: "https://video.example/map/a.m4s" }]);
assert.deepEqual(segmentenBereik('#EXT-X-MAP:URI="init.mp4"\na.m4s', basis), [{ url: "https://video.example/map/init.mp4" }, { url: "https://video.example/map/a.m4s" }]);

const origineel = globalThis.fetch;
const verzoeken: { url: string; bereik: string | null }[] = [];
const plan: Plan = { thumbs: [], preconnect: [], hlsChunk: false, hls: [basis], mp4: null };
try {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const bereik = new Headers(init?.headers).get("Range");
    verzoeken.push({ url, bereik });
    if (url === basis) return new Response(playlist);
    if (url.endsWith("init.mp4")) return new Response(new Uint8Array(100), { status: 206, headers: { "Content-Range": "bytes 20-119/1000" } });
    return new Response(new Uint8Array(10));
  }) as typeof fetch;
  voerUit(plan);
  for (let i = 0; i < 100; i++) await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(verzoeken, [
    { url: basis, bereik: null },
    { url: "https://video.example/init.mp4", bereik: "bytes=20-119" },
    { url: "https://video.example/map/segment1.m4s", bereik: `bytes=0-${HLS_BYTES - 101}` },
  ]);
  console.log("✓ HLS-initialisatiesegment valt binnen de verzoek- en bytegrens");
} finally {
  globalThis.fetch = origineel;
}
