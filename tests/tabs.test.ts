import assert from "node:assert/strict";
import { CATS, CAT_LABEL, tabOpties, tabToets, volgendeTab } from "../src/tabs";
import type { Cat } from "../src/types";

const t = (naam: string, fn: () => void) => { fn(); console.log("✓", naam); };
const ALLE: Cat[] = CATS.map((c) => c.id);
const items = (...cats: Cat[]) => cats.map((cat) => ({ cat }));
const ids = (v: ReturnType<typeof tabOpties>) => v.map((o) => o.value);

t("tabvolgorde met alle rubrieken gevuld", () => {
  assert.deepEqual(ids(tabOpties(items(...ALLE), "alles")),
    ["alles", "nl", "buitenland", "politiek", "voetbal", "f1", "auto", "sport", "tech", "haarlem", "showbizz", "filmpjes", "dumpert"]);
});
t("lege nieuws-tabs verborgen; Home, Filmpjes en Dumpert blijven", () => {
  assert.deepEqual(ids(tabOpties(items("nl", "auto"), "alles")), ["alles", "nl", "auto", "filmpjes", "dumpert"]);
  assert.deepEqual(ids(tabOpties([], "alles")), ["alles", "filmpjes", "dumpert"]);
});
t("actieve lege tab blijft zichtbaar, op de juiste plek", () => {
  assert.deepEqual(ids(tabOpties(items("nl", "tech"), "f1")), ["alles", "nl", "f1", "tech", "filmpjes", "dumpert"]);
});
t("slug en label voor de nieuwe rubrieken", () => {
  const slug = (id: Cat) => CATS.find((c) => c.id === id)?.slug;
  assert.equal(slug("voetbal"), "voetbal");
  assert.equal(slug("f1"), "formule-1");
  assert.equal(slug("auto"), "auto");
  assert.equal(CATS.find((c) => c.slug === "formule-1")?.id, "f1");
  assert.deepEqual([CAT_LABEL.voetbal, CAT_LABEL.f1, CAT_LABEL.auto], ["Voetbal", "Formule 1", "Auto"]);
  assert.equal(new Set(CATS.map((c) => c.slug)).size, CATS.length);
});

t("Sport-tab: slug, label en positie na Auto", () => {
  assert.equal(CATS.find((c) => c.id === "sport")?.slug, "sport");
  assert.equal(CAT_LABEL.sport, "Sport");
  assert.deepEqual(ids(tabOpties(items("auto", "sport", "tech"), "alles")), ["alles", "auto", "sport", "tech", "filmpjes", "dumpert"]);
  assert.deepEqual(ids(tabOpties(items("nl"), "alles")), ["alles", "nl", "filmpjes", "dumpert"]);
});

t("eerste tab heet Home", () => {
  assert.deepEqual(tabOpties([], "alles")[0], { value: "alles", id: "all", label: "Home", short: "Home" });
});

t("pijltjestoetsen doorlopen de zichtbare tabs in beide richtingen", () => {
  assert.equal(volgendeTab(0, 3, "ArrowRight"), 1);
  assert.equal(volgendeTab(2, 3, "ArrowRight"), 0);
  assert.equal(volgendeTab(0, 3, "ArrowLeft"), 2);
  assert.equal(volgendeTab(1, 3, "Tab"), null);
  assert.equal(volgendeTab(2, 3, "Home"), 0);
  assert.equal(volgendeTab(0, 3, "End"), 2);
});

// tabToets (#791): focus en klik naar de buurtab.
{
  const druk = (van: number, key: string) => {
    const log: string[] = [];
    const tabs = Array.from({ length: 3 }, (_, i) => ({ focus: () => log.push(`focus${i}`), click: () => log.push(`klik${i}`) }));
    let geblokkeerd = false;
    tabToets({ key, currentTarget: Object.assign(tabs[van], { parentElement: { querySelectorAll: () => tabs } }) as unknown as HTMLElement, preventDefault: () => (geblokkeerd = true) });
    return { log, geblokkeerd };
  };
  t("tabToets: rechts loopt door aan het einde", () => assert.deepEqual(druk(2, "ArrowRight").log, ["focus0", "klik0"]));
  t("tabToets: links loopt door aan het begin", () => assert.deepEqual(druk(0, "ArrowLeft").log, ["focus2", "klik2"]));
  t("tabToets: Home en End", () => {
    assert.deepEqual(druk(1, "Home").log, ["focus0", "klik0"]);
    assert.deepEqual(druk(1, "End").log, ["focus2", "klik2"]);
  });
  t("tabToets: andere toets doet niets", () => {
    const r = druk(1, "a");
    assert.deepEqual(r.log, []);
    assert.equal(r.geblokkeerd, false);
  });
}
