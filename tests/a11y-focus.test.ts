// #328: ARIA en focus in de bron: slider-waarden, YouTube-iframe zonder tabIndex=-1, focus bij artikel openen/terug.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const feed = readFileSync("src/feed.tsx", "utf8");
const app = readFileSync("src/App.tsx", "utf8");
const t = (name: string, fn: () => void) => { fn(); console.log("✓", name); };

t("scrubber heeft altijd aria-valuenow en aria-valuetext", () => {
  const slider = feed.slice(feed.indexOf('role="slider"'), feed.indexOf("onPointerDown={enabled"));
  assert.match(slider, /aria-valuenow=\{[^}]*: 0\}/);
  assert.doesNotMatch(slider, /aria-valuenow=\{[^}]*undefined/);
  assert.match(slider, /aria-valuetext=/);
  assert.match(feed, /ArrowRight[\s\S]{0,200}\? 5 : -5/);
});

t("YouTube-iframe is niet uit de tabvolgorde gehaald", () => {
  const iframe = feed.slice(feed.indexOf("<iframe"), feed.indexOf("/>", feed.indexOf("<iframe")));
  assert.doesNotMatch(iframe, /tabIndex/);
});

t("artikel: focus op h1 (tabindex -1), Escape = terug, focus terug op de kaart", () => {
  assert.match(app, /<h1 className="d-title" ref=\{kopRef\} tabIndex=\{-1\}>/);
  assert.match(app, /kopRef\.current\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(app, /e\.key === "Escape" && onBack\(\)/);
  assert.match(app, /scrollIntoView\(\{ block: "center" \}\);[\s\S]{0,300}f\.focus\(\{ preventScroll: true \}\)/);
});
