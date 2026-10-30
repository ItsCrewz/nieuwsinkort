import assert from "node:assert/strict";
import { CATS, tabOpties } from "../src/tabs";
import type { Cat } from "../src/types";

const t = (naam: string, fn: () => void) => { fn(); console.log("✓", naam); };
const items = (...cats: Cat[]) => cats.map((cat) => ({ cat }));
const ids = (v: ReturnType<typeof tabOpties>) => v.map((o) => o.value);

t("dubbele categorieën geven één tab, volgorde volgt CATS", () => {
  assert.deepEqual(ids(tabOpties(items("tech", "nl", "tech", "nl"), "alles")), ["alles", "nl", "tech", "filmpjes", "dumpert"]);
});
t("actieve video-view of Home voegt geen nieuws-tab toe", () => {
  assert.deepEqual(ids(tabOpties([], "filmpjes")), ["alles", "filmpjes", "dumpert"]);
  assert.deepEqual(ids(tabOpties([], "dumpert")), ["alles", "filmpjes", "dumpert"]);
});
t("actieve lege tab is de enige lege die zichtbaar blijft", () => {
  assert.deepEqual(ids(tabOpties([], "haarlem")), ["alles", "haarlem", "filmpjes", "dumpert"]);
});
t("korte labels: NL en Tech ingekort, rest gelijk aan label", () => {
  const o = tabOpties(items(...CATS.map((c) => c.id)), "alles");
  const kort = (id: string) => o.find((x) => x.id === id)?.short;
  assert.equal(kort("nl"), "NL");
  assert.equal(kort("tech"), "Tech");
  assert.equal(kort("f1"), "Formule 1");
  assert.equal(kort("buitenland"), "Buitenland");
});
t("Home blijft eerste, Filmpjes en Dumpert laatste; invoer blijft ongewijzigd", () => {
  const invoer = items("auto", "nl");
  const kopie = JSON.stringify(invoer);
  const o = tabOpties(invoer, "alles");
  assert.equal(o[0].value, "alles");
  assert.deepEqual(ids(o).slice(-2), ["filmpjes", "dumpert"]);
  assert.equal(JSON.stringify(invoer), kopie);
});
