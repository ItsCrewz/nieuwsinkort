import assert from "node:assert/strict";
import { volgendeFocus } from "../src/focusval";

const el = (n: string) => ({ n }) as unknown as HTMLElement;
const [a, b, c] = [el("a"), el("b"), el("c")];
const lijst = [a, b, c];
assert.equal(volgendeFocus(lijst, c, false), a); // Tab op laatste: rond naar eerste
assert.equal(volgendeFocus(lijst, a, true), c); // Shift+Tab op eerste: rond naar laatste
assert.equal(volgendeFocus(lijst, b, false), null); // midden: browser kiest zelf
assert.equal(volgendeFocus(lijst, b, true), null);
assert.equal(volgendeFocus(lijst, null, false), a); // focus buiten het venster: terughalen
assert.equal(volgendeFocus(lijst, el("x") as unknown as Element, true), c);
assert.equal(volgendeFocus([], a, false), null);
assert.equal(volgendeFocus([a], a, false), a); // één element: blijft daar
assert.equal(volgendeFocus([a], a, true), a);
console.log("focusval: tests geslaagd");
