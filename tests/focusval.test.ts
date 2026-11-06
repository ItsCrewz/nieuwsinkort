import assert from "node:assert/strict";
import { bediening, volgendeFocus } from "../src/focusval";

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
// bediening(): uitgeschakelde, tabindex -1, onzichtbare en aria-hidden elementen vallen af; veel bronnen blijven in volgorde
const knop = (o: { disabled?: boolean; tabIndex?: number; rects?: number; hidden?: boolean } = {}) =>
  ({ disabled: o.disabled ?? false, tabIndex: o.tabIndex ?? 0, getClientRects: () => ({ length: o.rects ?? 1 }), getAttribute: () => (o.hidden ? "true" : null) }) as unknown as HTMLElement;
const sluit = knop(), uit = knop({ disabled: true }), min = knop({ tabIndex: -1 }), weg = knop({ rects: 0 }), verborgen = knop({ hidden: true });
const bronnen = Array.from({ length: 200 }, () => knop());
const root = { querySelectorAll: () => [sluit, uit, min, weg, verborgen, ...bronnen] } as unknown as ParentNode;
const lijst2 = bediening(root);
assert.equal(lijst2.length, 201);
assert.equal(lijst2[0], sluit);
assert.equal(volgendeFocus(lijst2, lijst2[200], false), sluit); // Tab op laatste van veel bronnen: rond
assert.equal(volgendeFocus(lijst2, sluit, true), lijst2[200]); // Shift+Tab op eerste: rond
console.log("focusval: tests geslaagd");
