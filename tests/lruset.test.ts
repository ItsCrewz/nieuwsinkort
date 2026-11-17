// Draai: npm run test  (bundelt met esbuild en draait met node)
import assert from "node:assert/strict";
import { LruSet } from "../src/lruset";

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log("✓", name); };

t("lruset: size, max, add geeft this terug en dubbel toevoegen telt één keer", () => {
  const s = new LruSet<string>(3);
  assert.equal(s.max, 3);
  assert.equal(s.size, 0);
  assert.equal(s.add("a"), s);
  s.add("a");
  assert.equal(s.size, 1);
  assert.equal(s.has("a"), true);
  assert.equal(s.has("b"), false);
});

t("lruset: delete meldt of de sleutel bestond en laat opnieuw toevoegen toe", () => {
  const s = new LruSet<string>(2);
  s.add("a");
  assert.equal(s.delete("a"), true);
  assert.equal(s.delete("a"), false);
  assert.equal(s.has("a"), false);
  s.add("a");
  assert.equal(s.has("a"), true);
  assert.equal(s.size, 1);
});

t("lruset: langst ongebruikte sleutel valt weg bij overschrijding", () => {
  const s = new LruSet<string>(2);
  s.add("a").add("b").add("c");
  assert.equal(s.size, 2);
  assert.equal(s.has("a"), false);
  assert.equal(s.has("b"), true);
  assert.equal(s.has("c"), true);
});

t("lruset: has ververst de volgorde", () => {
  const s = new LruSet<string>(2);
  s.add("a").add("b");
  assert.equal(s.has("a"), true); // a is nu recent, b het oudst
  s.add("c");
  assert.equal(s.has("b"), false);
  assert.equal(s.has("a"), true);
  assert.equal(s.has("c"), true);
});

t("lruset: herhaalde add ververst de volgorde", () => {
  const s = new LruSet<string>(2);
  s.add("a").add("b").add("a").add("c");
  assert.equal(s.has("b"), false);
  assert.equal(s.has("a"), true);
});

t("lruset: een gemiste has verandert niets", () => {
  const s = new LruSet<string>(2);
  s.add("a").add("b");
  assert.equal(s.has("x"), false);
  assert.equal(s.size, 2);
  s.add("c");
  assert.equal(s.has("a"), false);
});

t("lruset: max=1 houdt alleen de laatste, max=0 houdt niets", () => {
  const een = new LruSet<string>(1);
  een.add("a").add("b");
  assert.equal(een.size, 1);
  assert.equal(een.has("a"), false);
  assert.equal(een.has("b"), true);
  const nul = new LruSet<string>(0);
  nul.add("a");
  assert.equal(nul.size, 0);
  assert.equal(nul.has("a"), false);
});

t("lruset: werkt ook met niet-string sleutels", () => {
  const o = {};
  const s = new LruSet<number | object>(2);
  s.add(1).add(o);
  assert.equal(s.has(1), true);
  assert.equal(s.has(o), true);
  assert.equal(s.has({}), false);
  s.add(2);
  assert.equal(s.size, 2);
  assert.equal(s.has(1), false);
});

console.log(`\n${n} tests geslaagd`);
