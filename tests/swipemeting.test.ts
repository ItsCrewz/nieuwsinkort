import { strict as assert } from "node:assert";
import { bewaarMeting, herstelSwipe, swipeDoel, type SwipeMeting } from "../src/swipemeting";

assert.equal(swipeDoel(0, 500, 0, 470, 2), null); // precies 30 px
assert.equal(swipeDoel(0, 500, 0, 469, 2), 3);
assert.equal(swipeDoel(0, 500, 0, 531, 2), 1); // omgekeerd
assert.equal(swipeDoel(0, 500, 100, 450, 2), null); // horizontaal
assert.equal(swipeDoel(0, 500, 60, 400, 2), 3); // overwegend verticaal
assert.equal(swipeDoel(0, 500, 80, 440, 2), null); // diagonaal
const metingen: SwipeMeting[] = [];
for (let i = 0; i < 12; i++) bewaarMeting(metingen, { slide: i, gesture: i });
assert.equal(metingen.length, 10);
assert.equal(metingen[0].slide, 2);
console.log("swipemeting: tests geslaagd");

assert.equal(herstelSwipe(2, 3, 2), true);
assert.equal(herstelSwipe(2, 3, 3), false);
assert.equal(herstelSwipe(2, 2, 2), false);
