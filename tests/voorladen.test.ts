import assert from "node:assert/strict";
import { budgetVan } from "../src/netwerk";
import { planVoorladen, laagsteVariant, segmenten, type Hulp, type Speler } from "../src/voorladen";
import type { Video } from "../src/types";

const t = (naam: string, f: () => void) => {
  f();
  console.log("✓", naam);
};
const vid = (id: string, embed: string, thumb = `https://img.example/${id}.jpg`): Video =>
  ({ titel: id, ai: "", bron: "x", href: `https://x.nl/${id}`, embed, thumb, populariteit: "", tijd: "" });
// kleine stand-in voor playerFor/viaProxy uit video.tsx (die haalt React-componenten mee)
const h: Hulp = {
  playerFor: (v): Speler => (/\.m3u8/.test(v.embed || "") ? { kind: "hls", src: v.embed! } : /\.mp4/.test(v.embed || "") ? { kind: "mp4", src: v.embed! } : /youtube/.test(v.embed || "") ? { kind: "youtube", src: v.embed! } : null),
  viaProxy: (s) => s.replace("https://media.dumpert.nl", "/media/dumpert"),
};
const dmp = (n: number) => Array.from({ length: n }, (_, i) => vid(`d${i}`, `https://media.dumpert.nl/v/${i}/index.m3u8`));
const flm = (n: number) => Array.from({ length: n }, (_, i) => vid(`f${i}`, `https://scontent-lis1-1.cdninstagram.com/o1/${i}.mp4?x=1`));

t("netwerkniveau", () => {
  assert.equal(budgetVan(undefined), "normaal");
  assert.equal(budgetVan({ effectiveType: "4g", type: "wifi" }), "normaal");
  assert.equal(budgetVan({ saveData: true, effectiveType: "4g" }), "geen");
  assert.equal(budgetVan({ effectiveType: "2g" }), "geen");
  assert.equal(budgetVan({ effectiveType: "slow-2g" }), "geen");
  assert.equal(budgetVan({ effectiveType: "3g" }), "zuinig");
  assert.equal(budgetVan({ effectiveType: "4g", type: "cellular" }), "zuinig");
});
t("geen: niets vooraf", () => {
  const p = planVoorladen(flm(5), dmp(5), "geen", false, h);
  assert.deepEqual(p, { thumbs: [], preconnect: [], hlsChunk: false, hls: [], mp4: null });
});
t("normaal: 6 thumbs per tab, chunk, 2 hls via proxy, eerste mp4, preconnect", () => {
  const p = planVoorladen(flm(8), dmp(8), "normaal", false, h);
  assert.equal(p.thumbs.length, 12);
  assert.equal(p.hlsChunk, true);
  assert.deepEqual(p.hls, ["/media/dumpert/v/0/index.m3u8", "/media/dumpert/v/1/index.m3u8"]);
  assert.equal(p.mp4, flm(1)[0].embed);
  assert.deepEqual(p.preconnect, ["https://scontent-lis1-1.cdninstagram.com"]);
});
t("zuinig: 3 thumbs per tab + chunk + preconnect, geen video-bytes", () => {
  const p = planVoorladen(flm(8), dmp(8), "zuinig", false, h);
  assert.equal(p.thumbs.length, 6);
  assert.equal(p.hlsChunk, true);
  assert.deepEqual(p.hls, []);
  assert.equal(p.mp4, null);
  assert.equal(p.preconnect.length, 1);
});
t("Safari: geen hls.js-chunk, geen proxy; preconnect rechtstreeks naar Dumpert", () => {
  const p = planVoorladen([], dmp(4), "normaal", true, h);
  assert.equal(p.hlsChunk, false);
  assert.deepEqual(p.hls, []);
  assert.deepEqual(p.preconnect, ["https://media.dumpert.nl"]);
  assert.equal(p.thumbs.length, 4);
});
t("ontdubbelen en ongeldige thumbs", () => {
  const a = vid("a", "https://media.dumpert.nl/v/a/index.m3u8", "https://img.example/zelfde.jpg");
  const b = vid("b", "https://media.dumpert.nl/v/a/index.m3u8", "https://img.example/zelfde.jpg");
  const c = vid("c", "https://media.dumpert.nl/v/c/index.m3u8", "javascript:alert(1)");
  const d = vid("d", "https://media.dumpert.nl/v/d/index.m3u8", "");
  const p = planVoorladen([], [a, b, c, d], "normaal", false, h);
  assert.deepEqual(p.thumbs, ["https://img.example/zelfde.jpg"]);
  assert.deepEqual(p.hls, ["/media/dumpert/v/a/index.m3u8", "/media/dumpert/v/c/index.m3u8"]);
});
t("youtube: alleen preconnect; mp4 buiten de eerste drie telt niet", () => {
  const yt = vid("y", "https://www.youtube-nocookie.com/embed/abcdefghijk");
  const p = planVoorladen([yt, ...flm(1).map((v) => ({ ...v, embed: "x" })), vid("z", "x"), ...flm(2)], [], "normaal", false, h);
  assert.deepEqual(p.preconnect, ["https://www.youtube-nocookie.com"]);
  assert.equal(p.mp4, null);
});
t("lege lijsten", () => {
  assert.deepEqual(planVoorladen([], [], "normaal", false, h), { thumbs: [], preconnect: [], hlsChunk: false, hls: [], mp4: null });
});
t("playlist: laagste variant en eerste segmenten", () => {
  const m = "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=2000000\nhi/index.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=500000,RESOLUTION=1x1\nlo/index.m3u8\n";
  assert.equal(laagsteVariant(m, "https://s.nl/a/master.m3u8"), "https://s.nl/a/lo/index.m3u8");
  assert.equal(laagsteVariant("#EXTM3U\n", "https://s.nl/a/"), "");
  const v = "#EXTM3U\n#EXTINF:4,\ns0.ts\n#EXTINF:4,\ns1.ts\n#EXTINF:4,\ns2.ts\n";
  assert.deepEqual(segmenten(v, "https://s.nl/a/lo/index.m3u8"), ["https://s.nl/a/lo/s0.ts", "https://s.nl/a/lo/s1.ts"]);
});
