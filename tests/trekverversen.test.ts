import assert from "node:assert/strict";
import { magVerversen, trekAfstand, TREK_DREMPEL, TREK_REM } from "../src/trekverversen";

assert.equal(trekAfstand(-10), 0);
assert.equal(trekAfstand(100), 50);
assert.equal(trekAfstand(200), 72);
assert.equal(magVerversen(TREK_DREMPEL - 1, 100_000, 0), false);
assert.equal(magVerversen(TREK_DREMPEL, TREK_REM - 1, 0), false);
assert.equal(magVerversen(TREK_DREMPEL, TREK_REM, 0), true);
console.log("✓ trekverversen: weerstand, drempel en rem");

const bron = (await import("node:fs")).readFileSync("src/trekverversen.ts", "utf8");
for (const gebeurtenis of ["touchstart", "touchmove", "touchend", "touchcancel"]) {
  assert.match(bron, new RegExp(`addEventListener\\("${gebeurtenis}", [^,]+, \\{ passive: true \\}\\)`));
}
