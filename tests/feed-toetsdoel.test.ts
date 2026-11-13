// #763: feed-sneltoetsen kapen geen bediening buiten de feed. Minimale stubs, geen DOM-bibliotheek.
import assert from "node:assert/strict";
import { feedToetsDoel } from "../src/toetsdoel";

const t = (name: string, fn: () => void) => { fn(); console.log("ok", name); };
const knop = { closest: (s: string) => (s.includes("button") ? knop : null) };
const link = { closest: (s: string) => (s.includes("a,") ? link : null) };
const body = { closest: () => null };
const kaart = { closest: (s: string) => (s.includes("a,") ? kaart : null) }; // link binnen de feed
const feed = { contains: (n: unknown) => n === kaart };

for (const toets of ["Home", "End", "ArrowDown", "ArrowUp", "j", "k"]) {
  t(`${toets}: externe knop behoudt eigen gedrag`, () => assert.equal(feedToetsDoel(knop, feed), false));
  t(`${toets}: externe link behoudt eigen gedrag`, () => assert.equal(feedToetsDoel(link, feed), false));
  t(`${toets}: neutraal doel en feed werken`, () => {
    assert.equal(feedToetsDoel(body, feed), true);
    assert.equal(feedToetsDoel(null, feed), true);
    assert.equal(feedToetsDoel(kaart, feed), true);
  });
}
