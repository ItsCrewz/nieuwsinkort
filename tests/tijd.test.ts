import assert from "node:assert/strict";
import { ams, midnight } from "../src/tijd";
assert.deepEqual(ams(Date.parse("2026-01-01T23:30:45Z")), { y: 2026, m: 1, d: 2, h: 0, min: 30, s: 45, iso: "2026-01-02", hhmm: "00:30" });
for (const [tijd, begin] of [["2026-01-02T12:00:00Z", "2026-01-01T23:00:00Z"], ["2026-07-02T12:00:00Z", "2026-07-01T22:00:00Z"], ["2026-03-29T12:00:00Z", "2026-03-28T23:00:00Z"], ["2026-10-25T12:00:00Z", "2026-10-24T22:00:00Z"]]) assert.equal(midnight(Date.parse(tijd)), Date.parse(begin), tijd);
assert.throws(() => ams(NaN), RangeError);
console.log("✓ tijd: UTC, zomer- en wintertijd");
