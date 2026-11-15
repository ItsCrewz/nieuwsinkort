// #984: de videovoortgang is met toetsen te bedienen en de globale feedtoetsen laten de slider met rust.
import assert from "node:assert/strict";
import { isSliderDoel, scrubDoel } from "../src/scrub";

const t = (name: string, fn: () => void) => { fn(); console.log("ok", name); };

t("pijlen verplaatsen 5 s", () => {
  assert.equal(scrubDoel("ArrowRight", 10, 60), 15);
  assert.equal(scrubDoel("ArrowUp", 10, 60), 15);
  assert.equal(scrubDoel("ArrowLeft", 10, 60), 5);
  assert.equal(scrubDoel("ArrowDown", 10, 60), 5);
});
t("Home en End gaan naar begin en einde", () => {
  assert.equal(scrubDoel("Home", 30, 60), 0);
  assert.equal(scrubDoel("End", 30, 60), 60);
});
t("resultaat blijft binnen 0 en de duur", () => {
  assert.equal(scrubDoel("ArrowLeft", 2, 60), 0);
  assert.equal(scrubDoel("ArrowRight", 58, 60), 60);
});
t("ongeldige duur of onbekende toets geeft null", () => {
  for (const d of [0, -1, NaN, Infinity]) assert.equal(scrubDoel("ArrowRight", 1, d), null);
  assert.equal(scrubDoel("a", 1, 60), null);
  assert.equal(scrubDoel("PageDown", 1, 60), null);
});
t("ongeldige huidige stand telt als begin", () => assert.equal(scrubDoel("ArrowRight", NaN, 60), 5));

// Globale handler (feed.tsx onKey) slaat go() over als het doel een slider is.
const slider = { closest: (s: string) => (s.includes("role=slider") ? slider : null) };
const kind = { closest: (s: string) => (s.includes("role=slider") ? slider : null) };
const knop = { closest: () => null };
t("doel binnen de slider: globale handler slaat over", () => {
  assert.equal(isSliderDoel(slider), true);
  assert.equal(isSliderDoel(kind), true);
});
t("doel buiten de slider of leeg: feed blijft werken", () => {
  assert.equal(isSliderDoel(knop), false);
  assert.equal(isSliderDoel(null), false);
});
