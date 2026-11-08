import assert from "node:assert/strict";
import { buildSources, GROUP_ORDER, norm, sourceKey } from "../src/sources";
import type { Catalog } from "../src/sources";
import type { Data, Item } from "../src/types";

assert.equal(norm("DÉ ÉÉN & Café"), "eencafe");
assert.equal(norm("cafe\u0301"), norm("CAFÉ"));
assert.equal(norm("HTTPS://WWW.ÉÉN.NL/NIEUWS"), "eennlnieuws");
assert.equal(norm("--- É À Ö ---"), "eao");
assert.equal(norm("  "), "");

const catalogus: Catalog = {
  groepen: [
    { id: "nl", label: "Nederland", bronnen: [
      { id: "eerste", naam: "Één Nieuws", alias: ["eennieuws", "gedeeld"], hosts: ["eerste.example", "gedeeld.example"] },
      { id: "tweede", naam: "Tweede Nieuws", alias: ["gedeeld"], hosts: ["gedeeld.example"] },
    ] },
    { id: "tech", label: "Tech", bronnen: [{ id: "techbron", naam: "Techbron", hosts: ["tech.example"] }] },
  ],
};
const index = buildSources(catalogus, null).index;

assert.equal(sourceKey(index, "nl", "ÉÉN NIEUWS", ""), "nl|eerste");
assert.equal(sourceKey(index, "nl", "Gedeeld", "https://gedeeld.example/bericht"), "nl|eerste");
assert.equal(sourceKey(index, "nl", "Tweede Nieuws", "https://eerste.example/bericht"), "nl|tweede");
assert.equal(sourceKey(index, "nl", "", "https://www.gedeeld.example/bericht"), "nl|eerste");
assert.equal(sourceKey(index, "nl", "Eerste", "https://sub.eerste.example/bericht"), "nl|eerste");
assert.equal(sourceKey(index, "nl", "Andere naam", "https://eerste.example/bericht"), "nl|anderenaam");
assert.equal(sourceKey(index, "nl", "", "geen geldige url"), "nl|onbekend");
assert.equal(sourceKey(index, "tech", "Één Nieuws", "https://eerste.example/bericht"), "tech|eennieuws");

const zonderData = buildSources(catalogus, null);
assert.deepEqual(zonderData.groups.map((groep) => [groep.id, groep.total, groep.published]), [
  ["nl", 0, null], ["tech", 0, null],
]);
assert.deepEqual(zonderData.groups.flatMap((groep) => groep.sources.map((bron) => [bron.key, bron.count, bron.fromData])), [
  ["nl|eerste", 0, false], ["nl|tweede", 0, false], ["tech|techbron", 0, false],
]);

const leeg = buildSources({ groepen: [] }, null);
assert.deepEqual(leeg.groups, []);
assert.deepEqual([...leeg.index.keys()], GROUP_ORDER.map((groep) => groep.id));
assert.equal(sourceKey(leeg.index, "nl", "Nieuwe Bron", "https://nieuw.example/bericht"), "nl|nieuwebron");

const bericht: Item = {
  cat: "nl", kop: "Bericht", ai: "", samenvatting: "", punten: [], tijd: "12:00",
  bronnen: [{ site: "Nieuwe Bron", href: "https://nieuw.example/bericht" }],
};
const data: Data = {
  datum: "2026-10-30", dag_samenvatting: "", weer: {} as Data["weer"],
  items: [bericht], filmpjes: [], dumpert: [],
};
const zonderCatalogus = buildSources({ groepen: [] }, data);
assert.deepEqual(zonderCatalogus.groups.map((groep) => [groep.id, groep.total, groep.published]), [["nl", 1, null]]);
assert.deepEqual(zonderCatalogus.groups[0].sources, [
  { id: "nieuwebron", naam: "Nieuwe Bron", key: "nl|nieuwebron", count: 1, fromData: true },
]);

const onbekendeGroep = { ...bericht, cat: "onbekend" as Item["cat"] };
const zonderGeldigeGroep = buildSources({ groepen: [{ id: "onbekend" as "nl", label: "Onbekend", bronnen: [{ id: "bron", naam: "Bron" }] }] }, { ...data, items: [onbekendeGroep] });
assert.deepEqual(zonderGeldigeGroep.groups, []);
assert.equal([...zonderGeldigeGroep.index.values()].every((groep) => groep.rows.size === 0), true);
assert.equal(sourceKey(zonderGeldigeGroep.index, "onbekend" as "nl", "Dé Bron", "https://nieuw.example/bericht"), "onbekend|bron");

console.log("sources-randgevallen: tests geslaagd");