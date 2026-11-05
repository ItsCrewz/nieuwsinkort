// Draai: npm run test  (bundelt met esbuild en draait met node)
// Legt vast hoe de vier YouTube-ID-regexes bewust verschillen (niet samenvoegen, #565):
//  - slug.ts `youtubeId` en videosoort.ts `youtubeId`: ruim, ID van 6+ tekens, ook /live/ en youtube-nocookie;
//  - worker/videos.ts `ytVideoId`: gebruikt `youtubeId`, maar eist daarna precies 11 tekens (anders null);
//  - functions/samenvatting.ts `ytId`: precies 11 tekens, ook /live/ en youtube-nocookie;
//  - worker/reddit.ts: eigen URL-parser met precies 11 tekens, alleen youtube.com/shorts, youtu.be en /watch?v=.
import assert from "node:assert/strict";
import { youtubeId as slugId } from "../src/slug";
import { youtubeId as soortId } from "../src/videosoort";
import { ytVideoId } from "../worker/src/videos";
import { ytId } from "../functions/samenvatting";
import { video as redditVideo } from "../worker/src/reddit";

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log("✓", name); };

const ID = "dQw4w9WgXcQ";
const reddit = (u: string) => { const m = /embed\/([\w-]+)/.exec(redditVideo(u)?.embed || ""); return m ? m[1] : null; };

t("YouTube-ID-regexes: dezelfde voorbeeld-URL's", () => {
  const gelijk = [
    `https://www.youtube.com/watch?v=${ID}`, `https://www.youtube.com/watch?v=${ID}&t=5s`, `https://www.youtube.com/watch?feature=share&v=${ID}`,
    `https://youtu.be/${ID}`, `https://youtu.be/${ID}?t=5`, `https://www.youtube.com/shorts/${ID}`, `https://www.youtube.com/embed/${ID}?autoplay=1`,
  ];
  for (const u of gelijk) {
    assert.equal(slugId(u), ID, u);
    assert.equal(soortId(u), ID, u);
    assert.equal(ytVideoId({ href: u }), ID, u);
    assert.equal(ytId(u), ID, u);
    assert.equal(reddit(u), u.includes("/embed/") ? null : ID, u);
  }
});

t("YouTube-ID-regexes: verschillen per variant", () => {
  const live = `https://www.youtube.com/live/${ID}`;
  assert.equal(slugId(live), ID); assert.equal(soortId(live), ID); assert.equal(ytVideoId({ href: live }), ID); assert.equal(ytId(live), ID);
  const nocookie = `https://www.youtube-nocookie.com/embed/${ID}`;
  assert.equal(slugId(nocookie), ID); assert.equal(ytVideoId({ embed: nocookie }), ID);
  // kort ID (6–10 tekens): youtubeId accepteert, ytVideoId (precies 11) niet
  const kort = "https://youtu.be/abc_12";
  assert.equal(slugId(kort), "abc_12"); assert.equal(soortId(kort), "abc_12"); assert.equal(ytVideoId({ href: kort }), null); assert.equal(ytId(kort), null);
  // te kort (<6): geen enkele
  assert.equal(slugId("https://youtu.be/abc"), null); assert.equal(soortId("https://youtu.be/abc"), null);
  // niet-YouTube
  assert.equal(slugId("https://example.com/watch?v=" + ID), null);
});

t("YouTube-ID-regexes: reddit.ts is strenger (precies 11, eigen hosts)", () => {
  for (const u of [`https://www.youtube.com/watch?v=${ID}`, `https://youtu.be/${ID}`, `https://www.youtube.com/shorts/${ID}`]) assert.equal(reddit(u), ID, u);
  assert.equal(reddit("https://youtu.be/abc_12"), null);
  // embed- en live-URL's kent reddit.ts niet
  assert.equal(reddit(`https://www.youtube.com/embed/${ID}`), null);
  assert.equal(reddit(`https://www.youtube.com/live/${ID}`), null);
});

console.log(`${n} tests ok`);
