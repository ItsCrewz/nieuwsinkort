import assert from "node:assert/strict";
import { FrameGezondheid, type FrameTik } from "../../src/framegezondheid";

const tik = (now: number, currentTime: number, frames = 5): FrameTik => ({
  now, currentTime, frames, paused: false, hidden: false, seeking: false, ended: false,
  seekRecent: false, videoWidth: 720, readyState: 4,
});

for (const [naam, tijd] of [["loop", 0.1], ["sprong", 30]] as const) {
  const meting = new FrameGezondheid();
  assert.equal(meting.tik(tik(0, 8)), "ok");
  assert.equal(meting.tik(tik(2000, 10)), "ok");
  assert.equal(meting.tik(tik(2500, tijd)), "ok", naam);
  assert.equal(meting.tik(tik(3000, tijd + 0.5)), "ok", naam);
  assert.equal(meting.tik(tik(4500, tijd + 2)), "ok", naam);
  assert.equal(meting.tik(tik(5000, tijd + 2.5)), "frame-vast", naam);
}

// Ook de controle op een ontbrekend eerste beeld krijgt een nieuw venster.
const eerste = new FrameGezondheid();
assert.equal(eerste.tik(tik(0, 8, 0)), "ok");
assert.equal(eerste.tik(tik(4000, 10, 0)), "ok");
assert.equal(eerste.tik(tik(5000, 0.1, 0)), "ok");
assert.equal(eerste.tik(tik(9500, 4.6, 0)), "ok");
assert.equal(eerste.tik(tik(10000, 5.1, 0)), "geen-eerste-frame");

console.log("✓ mediakloksprongen resetten de beeldmeting; echte stilstand blijft herkenbaar");
