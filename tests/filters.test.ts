import assert from "node:assert/strict";
import { aantalExtra, filterNieuws, STANDAARD, type Filters } from "../src/filters";
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
