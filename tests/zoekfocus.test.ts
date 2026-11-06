import assert from "node:assert/strict";
import { staatFocusInInvoer } from "../src/zoekfocus";

assert.equal(staatFocusInInvoer(null), false);
for (const tagName of ["INPUT", "TEXTAREA"]) assert.equal(staatFocusInInvoer({ tagName, isContentEditable: false }), true);
assert.equal(staatFocusInInvoer({ tagName: "SPAN", isContentEditable: true }), true);
assert.equal(staatFocusInInvoer({ tagName: "BUTTON", isContentEditable: false }), false);
console.log("zoekfocus: tests geslaagd");
