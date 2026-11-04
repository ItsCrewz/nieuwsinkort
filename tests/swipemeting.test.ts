import { strict as assert } from "node:assert";
import { bewaarMeting, herstelSwipe, swipeDoel, type SwipeMeting } from "../src/swipemeting";

assert.equal(swipeDoel(500, 470, 2), null);
assert.equal(swipeDoel(500, 469, 2), 3);
assert.equal(swipeDoel(500, 531, 2), 1);
const metingen: SwipeMeting[] = [];
for (let i = 0; i < 12; i++) bewaarMeting(metingen, { slide: i, gesture: i });
assert.equal(metingen.length, 10);
assert.equal(metingen[0].slide, 2);
console.log("swipemeting: tests geslaagd");

assert.equal(herstelSwipe(2, 3, 2), true);
assert.equal(herstelSwipe(2, 3, 3), false);
assert.equal(herstelSwipe(2, 2, 2), false);
