import assert from "node:assert/strict";
import { escapeSluit } from "../../src/detail";

// Escape tijdens IME-compositie sluit het artikel niet; daarna en zonder compositie wel.
const toets = (o: Partial<{ key: string; isComposing: boolean; keyCode: number; defaultPrevented: boolean }> = {}) =>
  escapeSluit({ key: "Escape", isComposing: false, keyCode: 27, defaultPrevented: false, ...o });

assert.equal(toets(), true);
assert.equal(toets({ isComposing: true }), false);
assert.equal(toets({ keyCode: 229 }), false);
assert.equal(toets({ isComposing: false, keyCode: 27 }), true);
assert.equal(toets({ defaultPrevented: true }), false);
assert.equal(toets({ key: "Enter" }), false);
