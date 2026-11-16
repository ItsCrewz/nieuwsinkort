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
