// Trek-om-te-verversen (#540): drempel, weerstand, rem en passieve listeners. Draai: npm test
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DREMPEL, MAX_TREK, REM_MS, besluit, isNieuwer, magVerversen, verversTijd, zetVerversTijd, overDrempel, trekAfstand, voortgang } from "../src/trekverversen";

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log("✓", name); };

t("weerstand: halve vingerafstand, begrensd op 72 px, nooit negatief", () => {
  assert.equal(trekAfstand(40), 20);
  assert.equal(trekAfstand(1000), MAX_TREK);
  assert.equal(trekAfstand(-30), 0);
  assert.equal(trekAfstand(0), 0);
});

t("drempel 56 px en voortgang voor de pijl", () => {
  assert.equal(overDrempel(DREMPEL - 1), false);
  assert.equal(overDrempel(DREMPEL), true);
  assert.equal(voortgang(0), 0);
  assert.equal(voortgang(DREMPEL / 2), 0.5);
  assert.equal(voortgang(MAX_TREK), 1);
});

t("rem: één verversing per 30 s", () => {
  assert.equal(magVerversen(null, 1000), true);
  assert.equal(magVerversen(1000, 1000 + REM_MS - 1), false);
  assert.equal(magVerversen(1000, 1000 + REM_MS), true);
});

t("besluit: onder de drempel niets, erboven verversen, binnen de rem alleen 'bij'", () => {
  assert.equal(besluit(DREMPEL - 1, null, 0), "geen");
  assert.equal(besluit(DREMPEL, null, 0), "ververs");
  assert.equal(besluit(MAX_TREK, 5000, 5000 + 10_000), "bij");
  assert.equal(besluit(MAX_TREK, 5000, 5000 + REM_MS), "ververs");
  assert.equal(besluit(10, 5000, 5000 + 10_000), "geen");
});

t("rem staat op moduleniveau (overleeft remount bij rubriekwissel)", () => {
  zetVerversTijd(1000);
  assert.equal(verversTijd(), 1000);
  assert.equal(magVerversen(verversTijd(), 1000 + 5000), false);
  zetVerversTijd(null);
  const src = readFileSync("src/trekverversen.ts", "utf8");
  assert.doesNotMatch(src, /useRef<number \| null>/);
});

t("isNieuwer: alleen echt nieuwere tijd telt, oudere of ongeldige niet", () => {
  assert.equal(isNieuwer("2026-01-01T10:00:00Z", "2026-01-01T09:00:00Z"), true);
  assert.equal(isNieuwer("2026-01-01T10:00:00Z", "2026-01-01T10:00:00Z"), false);
  assert.equal(isNieuwer("2026-01-01T08:00:00Z", "2026-01-01T09:00:00Z"), false);
  assert.equal(isNieuwer(undefined, "2026-01-01T09:00:00Z"), false);
  assert.equal(isNieuwer("kapot", "2026-01-01T09:00:00Z"), false);
  assert.equal(isNieuwer("2026-01-01T10:00:00Z", undefined), true);
});

t("CSS: indicator gebruikt --card/--i2 en accent bij .klaar", () => {
  const css = readFileSync("src/index.css", "utf8");
  assert.match(css, /\.ptr\{[^}]*background:var\(--card\)[^}]*color:var\(--i2\)/);
  assert.match(css, /\.ptr\.klaar\{color:var\(--a\)\}/);
});

t("alle touch-listeners van de PTR zijn passief en preventDefault ontbreekt", () => {
  const src = readFileSync("src/trekverversen.ts", "utf8");
  const regels = src.split("\n").filter((r) => /addEventListener\("touch/.test(r));
  assert.equal(regels.length, 4);
  for (const r of regels) assert.match(r, /\bopt\)/);
  assert.match(src, /passive: true/);
  assert.doesNotMatch(src, /preventDefault/);
});

t("geen globale scroll-behavior: smooth in de CSS", () => {
  assert.doesNotMatch(readFileSync("src/index.css", "utf8"), /scroll-behavior\s*:\s*smooth/);
});

console.log(`${n} tests ok`);
