import assert from "node:assert/strict";
import { buildSources, GROUP_ORDER, norm, sourceKey } from "../src/sources";
import type { Catalog } from "../src/sources";
import type { Data, Item, Video } from "../src/types";

const item = (cat: Item["cat"], bronnen: Item["bronnen"]): Item => ({
  cat,
  kop: "Testbericht",
  ai: "",
  samenvatting: "",
  punten: [],
  tijd: "12:00",
  bronnen,
});
const video = (bron: string, href: string): Video => ({ titel: "Video", ai: "", bron, href, thumb: "", populariteit: "", tijd: "12:00" });
const catalog: Catalog = {
  groepen: [
    { id: "nl", label: "Nederland", bronnen: [{ id: "nos", naam: "NOS", alias: ["nosnieuws"], hosts: ["nos.nl"] }, { id: "nu", naam: "NU.nl", hosts: ["nu.nl"] }] },
    { id: "tech", label: "Tech & AI", bronnen: [{ id: "tweakers", naam: "Tweakers", hosts: ["tweakers.net"] }] },
    { id: "filmpjes", label: "Filmpjes", bronnen: [{ id: "yt", naam: "YouTube", hosts: ["youtube.com"] }] },
    { id: "dumpert", label: "Dumpert", bronnen: [{ id: "dumpert", naam: "Dumpert", hosts: ["dumpert.nl"] }] },
  ],
};
const data: Data = {
  datum: "2026-10-30",
  dag_samenvatting: "",
  weer: {} as Data["weer"],
  items: [
    item("nl", [{ site: "NOS Nieuws", href: "https://nos.nl/a" }, { site: "NOS", href: "https://nos.nl/b" }]),
    item("nl", [{ site: "Onbekend", href: "https://nieuw.example/artikel" }]),
    item("buitenland", [{ site: "NU.nl", href: "https://www.nu.nl/buitenland/1" }]),
    item("tech", [{ site: "", href: "https://www.tweakers.net/nieuws/1" }]),
  ],
  filmpjes: [video("YouTube", "https://youtube.com/watch?v=1"), video("Nieuwe zender", "https://video.example/1")],
  dumpert: [video("", "https://dumpert.nl/item/1")],
  bronstats: {
    "nl|nos": { vandaag: 3 },
    "nl|nu": { vandaag: null },
    "tech|tweakers": { vandaag: 2 },
  },
};

assert.equal(norm("Dé WWW.Example.nl/nieuws"), "wwwexamplenlnieuws");
assert.equal(norm("https://www.NU.nl/AI & Tech"), "nunlaitech");
assert.equal(norm(""), "");

assert.deepEqual(GROUP_ORDER.map((g) => g.id), ["nl", "politiek", "voetbal", "f1", "auto", "tech", "haarlem", "showbizz", "filmpjes", "dumpert"]);

const { groups, index } = buildSources(catalog, data);
assert.deepEqual(groups.map((g) => g.id), ["nl", "tech", "filmpjes", "dumpert"]);
assert.deepEqual(groups.find((g) => g.id === "nl"), {
  id: "nl",
  label: "Nederland",
  total: 3,
  published: 3,
  sources: [
    { id: "nos", naam: "NOS", alias: ["nosnieuws"], hosts: ["nos.nl"], key: "nl|nos", count: 1, fromData: false, stat: { vandaag: 3 } },
    { id: "nu", naam: "NU.nl", hosts: ["nu.nl"], key: "nl|nu", count: 1, fromData: false, stat: { vandaag: null } },
    { id: "onbekend", naam: "Onbekend", key: "nl|onbekend", count: 1, fromData: true },
  ],
});
assert.equal(groups.find((g) => g.id === "tech")?.published, 2);
assert.equal(groups.find((g) => g.id === "filmpjes")?.total, 2);
assert.equal(groups.find((g) => g.id === "dumpert")?.sources[0].id, "dumpert");

assert.equal(sourceKey(index, "nl", "NOS Nieuws", "https://nos.nl/a"), "nl|nos");
assert.equal(sourceKey(index, "tech", "", "https://www.tweakers.net/nieuws/1"), "tech|tweakers");
assert.equal(sourceKey(index, "nl", "Andere bron", "https://nieuw.example/a"), "nl|anderebron");
assert.equal(sourceKey(index, "nl", "", "https://nieuw.example/a"), "nl|nieuw.example");

const onbekendeCatalogus: Catalog = { groepen: [{ id: "onbekend" as "nl", label: "Onbekend", bronnen: [{ id: "x", naam: "X" }] }] };
assert.deepEqual(buildSources(onbekendeCatalogus, null).groups, []);

console.log("sources: tests geslaagd");