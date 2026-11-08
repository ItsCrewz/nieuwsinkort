import assert from "node:assert/strict";
import { posterVerborgen } from "../src/poster";

assert.equal(posterVerborgen("youtube", false, true, true), false);
assert.equal(posterVerborgen("youtube", true, true, true), true);
assert.equal(posterVerborgen("mp4", false, true, true), false);
assert.equal(posterVerborgen("hls", true, true, true), true);
assert.equal(posterVerborgen("youtube", false, true, false), false);
assert.equal(posterVerborgen("mp4", true, false, true), false);
assert.equal(posterVerborgen(undefined, true, false, false), false);
assert.equal(posterVerborgen("youtube", false, true, true, true), true);
assert.equal(posterVerborgen("youtube", false, true, true, false), false);
assert.equal(posterVerborgen("youtube", false, true, false, true), false);
assert.equal(posterVerborgen("youtube", false, false, true, true), false);
assert.equal(posterVerborgen("mp4", false, true, true, true), false);
assert.equal(posterVerborgen("hls", false, true, true, true), false);
