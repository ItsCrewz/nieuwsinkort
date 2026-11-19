// #1288: slides buiten beeld zijn inert (uit tabvolgorde en toegankelijkheidsboom); focus uit de vorige slide valt terug op de scroller.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const t = (name: string, fn: () => void) => { fn(); console.log("ok", name); };
const bron = readFileSync("src/feed.tsx", "utf8");

t("niet-actieve slide krijgt inert, actieve niet", () => {
  assert.match(bron, /<section className=\{`fslide[^>]*\{\.\.\.\(active \? \{\} : \{ inert: "" \}\)\}>/);
});
t("focus uit een inerte slide gaat naar de scroller", () => {
  assert.match(bron, /\.fslide\[inert\]/);
  assert.match(bron, /scroller\.current\?\.focus\(\{ preventScroll: true \}\)/);
});
