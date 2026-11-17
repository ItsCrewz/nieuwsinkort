import assert from "node:assert/strict";
import { Stall } from "../../src/stall";

const s = new Stall();
const tik = (now: number, bufferEinde: number) => s.tik({ now, currentTime: 10, paused: false,
  hidden: false, ended: false, seeking: false, herstelSeek: false, balkTijd: 10,
  bufferVooruit: bufferEinde - 10, bufferEinde, readyState: 2, networkState: 2 });

assert.equal(tik(0, 11), "ok");
assert.equal(tik(3000, 11), "nudge");
assert.equal(tik(5900, 11.1), "balk-stop");
assert.equal(tik(8800, 11.2), "ok");
assert.equal(tik(11799, 11.2), "ok");
assert.equal(tik(11800, 11.2), "herlaad");
console.log("✓ trage buffer stelt herladen uit tot de voortgang stopt");

const invoer = (now: number, bufferEinde: number) => ({ now, currentTime: 10, paused: false,
  hidden: false, ended: false, seeking: false, herstelSeek: false, balkTijd: 10,
  bufferVooruit: bufferEinde - 10, bufferEinde, readyState: 3, networkState: 2 });

{
  const speler = new Stall();
  speler.tik(invoer(0, 11));
  assert.equal(speler.tik(invoer(3000, 11)), "nudge");
  for (let now = 3300; now < 33000; now += 300) {
    assert.notEqual(speler.tik(invoer(now, 11 + now / 10000)), "herlaad");
  }
  assert.equal(speler.tik(invoer(33000, 14.3)), "herlaad");
}
console.log("✓ groeiende buffer stelt herladen hooguit dertig seconden uit");

for (const veld of ["paused", "seeking", "hidden"] as const) {
  const speler = new Stall();
  speler.tik(invoer(0, 11));
  assert.equal(speler.tik(invoer(3000, 11)), "nudge");
  for (let now = 3300; now <= 36000; now += 300) {
    assert.equal(speler.tik({ ...invoer(now, 11 + now / 10000), [veld]: true }), "ok");
  }
  assert.equal(speler.tik(invoer(36300, 14.63)), "ok");
}
console.log("✓ pauze, seek en verborgen tab onderbreken herstel bij groeiende buffer");
