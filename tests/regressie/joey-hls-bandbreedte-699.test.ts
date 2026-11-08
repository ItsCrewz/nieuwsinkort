import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { laagsteVariant } from "../../src/voorladen";

const playlist = readFileSync("tests/regressie/fixtures/hls-bandbreedte-699.m3u8", "utf8");
const basis = "https://media.example/video/master.m3u8";
assert.equal(laagsteVariant(playlist, basis), "https://media.example/video/laag/index.m3u8");
assert.equal(laagsteVariant("#EXT-X-STREAM-INF:BANDWIDTH=0\na.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=12x\nb.m3u8\n#EXT-X-STREAM-INF:AVERAGE-BANDWIDTH=1\nc.m3u8", basis), "");
assert.equal(laagsteVariant('#EXT-X-STREAM-INF:CODECS="a,BANDWIDTH=1",BANDWIDTH=20\na.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=10,AVERAGE-BANDWIDTH=100\nb.m3u8', basis), "https://media.example/video/b.m3u8");
