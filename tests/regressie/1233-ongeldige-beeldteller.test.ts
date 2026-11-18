import assert from "node:assert/strict";
import { decodeTeller, FrameGezondheid, frameTeller, frameTellerBron, type FrameTik } from "../../src/framegezondheid";

for (const ongeldig of [NaN, Infinity, -Infinity, -1]) {
  assert.equal(decodeTeller({ getVideoPlaybackQuality: () => ({ totalVideoFrames: ongeldig }), webkitDecodedFrameCount: 4 }), 4);
  assert.equal(decodeTeller({ getVideoPlaybackQuality: () => ({ totalVideoFrames: ongeldig }), webkitDecodedFrameCount: ongeldig }), null);
  const stand = { gepresenteerd: ongeldig, gedecodeerd: 4, rvfc: true, decode: true };
  assert.equal(frameTellerBron(stand), "decode");
  assert.equal(frameTeller(stand), 4);
  assert.equal(frameTeller({ ...stand, gepresenteerd: 2, gedecodeerd: ongeldig }), 2);
  assert.equal(frameTeller({ ...stand, gedecodeerd: ongeldig }), null);
  assert.equal(frameTeller({ ...stand, gepresenteerd: 0, gedecodeerd: ongeldig }), 0);

  const fg = new FrameGezondheid();
  const tik = (now: number, frames: number): FrameTik => ({ now, currentTime: now / 1000, frames, bron: "decode", paused: false, hidden: false, seeking: false, ended: false, seekRecent: false, videoWidth: 720, readyState: 4 });
  assert.equal(fg.tik(tik(0, 5)), "ok");
  for (let now = 500; now <= 6000; now += 500) assert.equal(fg.tik(tik(now, ongeldig)), "ok");
  assert.equal(fg.tik(tik(6500, 5)), "ok");
  for (let now = 7000; now < 9000; now += 500) assert.equal(fg.tik(tik(now, 5)), "ok");
  assert.equal(fg.tik(tik(9000, 5)), "frame-vast");
}
