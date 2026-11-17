import assert from "node:assert/strict";
import { decodeTeller, FrameGezondheid } from "../../src/framegezondheid";

// Browserdubbel: de kwaliteits-API kan bestaan zonder dat deze voor de bron werkt.
const video = { getVideoPlaybackQuality: (): { totalVideoFrames: number } => { throw new Error("niet beschikbaar"); }, webkitDecodedFrameCount: 4 };
assert.equal(decodeTeller(video), 4);
assert.equal(decodeTeller({ getVideoPlaybackQuality: video.getVideoPlaybackQuality }), null);
for (const ongeldig of [NaN, Infinity, -Infinity, -1]) {
  assert.equal(decodeTeller({ getVideoPlaybackQuality: () => ({ totalVideoFrames: ongeldig }), webkitDecodedFrameCount: 4 }), 4);
  assert.equal(decodeTeller({ webkitDecodedFrameCount: ongeldig }), null);
}
assert.equal(decodeTeller({ getVideoPlaybackQuality: () => ({ totalVideoFrames: 0 }), webkitDecodedFrameCount: 4 }), 0);

function bewaak(teller: (now: number) => number | null) {
  const bewaking = new FrameGezondheid();
  let besluit = "ok";
  for (let now = 0; now <= 3000; now += 500) {
    besluit = bewaking.tik({ now, currentTime: now / 1000, frames: teller(now), bron: "decode", paused: false,
      hidden: false, seeking: false, ended: false, seekRecent: false, videoWidth: 720, readyState: 4 });
    if (besluit !== "ok") break;
  }
  return besluit;
}
assert.equal(bewaak(() => decodeTeller(video)), "frame-vast");
assert.equal(bewaak(() => decodeTeller({ getVideoPlaybackQuality: video.getVideoPlaybackQuality })), "ok");
assert.equal(bewaak((now) => decodeTeller({ getVideoPlaybackQuality: () => ({ totalVideoFrames: now + 1 }), webkitDecodedFrameCount: 4 })), "ok");
