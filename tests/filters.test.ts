import assert from "node:assert/strict";
import { aantalExtra, filterNieuws, tijdstip, STANDAARD, type Filters } from "../src/filters";
import { midnight } from "../src/tijd";
import type { Item } from "../src/types";

const originalNow = Date.now;
Date.now = () => Date.parse("2026-10-29T00:30:00+01:00");
try {
  const item = (kop: string, tijd: string, sites = ["NOS"]): Item => ({
    kop, tijd, cat: "nl", ai: "", samenvatting: "", punten: [],
    bronnen: sites.map((site) => ({ site, href: `https://example.nl/video/${kop}` })),
  });
  const items = [item("gisteren", "23:50", ["NOS", "RTL"]), item("zonder tijd", ""),
    item("nieuw", "00:20"), item("gelijk", "00:20"), item("oud", "9.05")];
  const sorteer = (sort: Filters["sort"], extra: Partial<Filters> = {}) =>
    filterNieuws(items, { ...STANDAARD, tijd: "alles", sort, ...extra }, 0, undefined, true).items.map((it) => it.kop);
  assert.deepEqual(sorteer("nieuw"), ["nieuw", "gelijk", "gisteren", "oud", "zonder tijd"]);
  assert.deepEqual(sorteer("oud"), ["oud", "gisteren", "nieuw", "gelijk", "zonder tijd"]);
  assert.deepEqual(sorteer("bronnen"), ["gisteren", "nieuw", "gelijk", "oud", "zonder tijd"]);
  assert.deepEqual(items.map((it) => it.kop), ["gisteren", "zonder tijd", "nieuw", "gelijk", "oud"]);
  assert.deepEqual(sorteer("oud", { tijd: "1u", cats: ["nl"], regio: ["nl"], video: true, samen: true }), ["gisteren"]);
  assert.deepEqual(sorteer("oud", { cats: ["tech"] }), []);
  assert.equal(aantalExtra(STANDAARD, true), 0);
  for (const sort of ["oud", "bronnen"] as const) {
    assert.equal(aantalExtra({ ...STANDAARD, sort }, true), 1);
    const f: Filters = { ...STANDAARD, sort, cats: ["nl"], regio: ["nl"], video: true, samen: true };
    assert.equal(aantalExtra(f, true), 5);
    assert.equal(aantalExtra(f, false), 4);
  }
  console.log("✓ sorteervolgorde, middernacht, gelijke/ontbrekende tijden, gecombineerde filters en filterteller");
} finally {
  Date.now = originalNow;
}

const t = (naam: string, fn: () => void) => { fn(); console.log("✓", naam); };
const metNu = (nu: string, fn: () => void) => {
  Date.now = () => Date.parse(nu);
  try { fn(); } finally { Date.now = originalNow; }
};
const bericht = (kop: string, tijd: string): Item => ({
  kop, tijd, cat: "nl", ai: "", samenvatting: "", punten: [], bronnen: [],
});

t("middernacht gebruikt de offset van middernacht op beide wisseldagen", () => {
  assert.equal(midnight(Date.parse("2026-10-25T10:00:00+01:00")), Date.parse("2026-10-24T22:00:00Z"));
  assert.equal(midnight(Date.parse("2026-03-29T10:00:00+02:00")), Date.parse("2026-03-28T23:00:00Z"));
});

t("vijf minuten vooruit blijft nieuwste en valt binnen Laatste uur en Vandaag", () => {
  metNu("2026-10-30T10:00:00+01:00", () => {
    const items = [bericht("ouder", "09:40"), bericht("vooruit", "10:05")];
    for (const tijd of ["alles", "1u", "vandaag"] as const) {
      const uit = filterNieuws(items, { ...STANDAARD, tijd }, 0, new Date(Date.now()).toISOString(), true);
      assert.deepEqual(uit.items.map((it) => it.kop), ["vooruit", "ouder"]);
    }
  });
});

t("gegenereerd bepaalt gisteren; relatieve filters blijven tegen nu rekenen", () => {
  metNu("2026-10-30T07:30:00+01:00", () => {
    const gen = "2026-10-29T23:00:00+01:00";
    assert.equal(tijdstip("07:00", Date.parse(gen)), Date.parse("2026-10-29T07:00:00+01:00"));
    for (const tijd of ["vandaag", "1u", "3u"] as const) {
      assert.deepEqual(filterNieuws([bericht("gisteren", "07:00")], { ...STANDAARD, tijd }, 0, gen, true).items, []);
    }
    assert.equal(filterNieuws([bericht("gisteren", "07:00")], { ...STANDAARD, tijd: "alles" }, 0, gen, true).items.length, 1);
    for (const gen of [undefined, "ongeldig"]) {
      assert.equal(filterNieuws([bericht("vandaag", "07:00")], { ...STANDAARD, tijd: "1u" }, 0, gen, true).items.length, 1);
    }
  });
});
