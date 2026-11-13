import assert from "node:assert/strict";
import { dedupVideos, videoKeys } from "../../src/dedup";
import { videoSlug, vindSlug, youtubeId } from "../../src/slug";
import type { Video } from "../../src/types";
import { playerFor } from "../../src/videosoort";
import { dumpertEmbed } from "../../worker/src/videos";

const id = "abcdefghijk";
const video = (href: string, titel = "Eerste") => ({ href, titel, bron: "Test" }) as Video;
for (const url of [`https://m.youtube.com/watch?t=1&v=${id}`, `https://www.youtube-nocookie.com/embed/${id}`, `https://youtu.be/${id}`, `https://youtube.com/live/${id}`, `https://youtube.com/shorts/${id}`]) {
  assert.equal(youtubeId(url), id);
  assert.ok(videoKeys(video(url)).includes(`yt:${id}`));
  assert.equal(videoSlug(video(url)), `yt-${id}`);
  assert.equal(playerFor(video(url))?.kind, "youtube");
  assert.equal(dumpertEmbed({ media: [{ variants: [{ uri: url }] }] }), `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`);
}
for (const url of [`https://youtube.com.evil.test/watch?v=${id}`, `https://evil.test/youtube.com/watch?v=${id}`, `https://evil.test/?url=https://youtube.com/watch?v=${id}`, `ftp://youtube.com/watch?v=${id}`]) {
  assert.equal(youtubeId(url), null);
  assert.ok(!videoKeys(video(url)).includes(`yt:${id}`));
  assert.match(videoSlug(video(url)), /^v-/);
  assert.equal(playerFor(video(url)), null);
  assert.equal(playerFor({ ...video("https://ander.test"), embed: url }), null);
  assert.equal(dumpertEmbed({ media: [{ variants: [{ uri: url }] }] }), "");
}
for (const [host, pad, sleutel] of [
  ["instagram.com", "/reel/abcde", "ig:abcde"], ["x.com", "/naam/status/123", "x:123"],
  ["reddit.com", "/r/test/comments/abc", "rd:abc"], ["v.redd.it", "/abc", "vr:abc"],
  ["dumpert.nl", "/item/abc", "dp:abc"], ["video.twimg.com", "/ext_tw_video/123/vid/a.mp4", "xv:123"],
]) {
  assert.ok(videoKeys(video(`https://${host}${pad}`)).includes(sleutel));
  assert.ok(!videoKeys(video(`https://ander.test/${host}${pad}`)).includes(sleutel));
  assert.ok(!videoKeys(video(`https://${host}.ander.test${pad}`)).includes(sleutel));
}
const a = video(`https://ander.test/eerste/youtube.com/watch?v=${id}`, "Eerste");
const b = video(`https://ander.test/tweede/youtube.com/watch?v=${id}`, "Tweede");
assert.notEqual(videoSlug(a), videoSlug(b));
assert.equal(vindSlug([a, b], videoSlug(b)), b);
assert.equal(dedupVideos([a, b]).list.length, 2);
