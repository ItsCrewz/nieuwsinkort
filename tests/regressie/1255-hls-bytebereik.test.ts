import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { segmentenBereik } from "../../src/voorladen";

const basis = "https://video.example/";
const gewoon = readFileSync("tests/regressie/fixtures/voorladen-1114/playlist.m3u8", "utf8");
assert.deepEqual(segmentenBereik(gewoon, basis), [{ url: `${basis}segment.ts` }]);

// Een synthetische playlist: voor dit probleem is geen echte playlist aangeleverd.
const bereiken = "#EXTM3U\n#EXT-X-BYTERANGE:100@0\ngroot.mp4\n#EXT-X-BYTERANGE:50\ngroot.mp4";
assert.deepEqual(segmentenBereik(bereiken, basis), [
  { url: `${basis}groot.mp4`, bereik: { van: 0, tot: 99 } },
  { url: `${basis}groot.mp4`, bereik: { van: 100, tot: 149 } },
]);
assert.deepEqual(segmentenBereik(`${bereiken}\nander.ts\n#EXT-X-BYTERANGE:10\ngroot.mp4`, basis, 4).length, 3);
console.log("✓ HLS-bytebereiken sluiten alleen aan op het vorige segment; gewone playlists blijven werken");
