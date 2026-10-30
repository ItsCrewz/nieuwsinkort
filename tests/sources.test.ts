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

// norm: lidwoord "de" alleen vooraan, ontbrekende invoer wordt leeg
assert.equal(norm("De Telegraaf"), "telegraaf");
assert.equal(norm("Omroep de Gelderlander"), "omroepdegelderlander");
assert.equal(norm("Ñü Crème"), "nucreme");
assert.equal(norm(undefined as unknown as string), "");

// buildSources zonder catalogus en data: index met alle groepen, geen zichtbare groepen
const leeg = buildSources(null, null);
assert.deepEqual(leeg.groups, []);
assert.deepEqual([...leeg.index.keys()], GROUP_ORDER.map((g) => g.id));

// zonder bronstats: published null en geen stat; volgorde count, dan vandaag, dan naam
const sorteerCatalogus: Catalog = {
  groepen: [
    { id: "tech", label: "Tech & AI", bronnen: [{ id: "b", naam: "beta" }, { id: "a", naam: "Alpha" }, { id: "c", naam: "Gamma" }, { id: "d", naam: "Delta" }] },
    { id: "f1", label: "Formule 1" } as unknown as Catalog["groepen"][number],
  ],
};
const zonderStats = buildSources(sorteerCatalogus, { ...data, items: [item("tech", [{ site: "Gamma", href: "" }])], filmpjes: [], dumpert: [], bronstats: undefined });
assert.deepEqual(zonderStats.groups.map((g) => [g.id, g.total, g.published]), [["tech", 1, null]]);
assert.deepEqual(zonderStats.groups[0].sources.map((s) => s.id), ["c", "a", "b", "d"]);
assert.equal(zonderStats.groups[0].sources.some((s) => "stat" in s), false);
const metStats = buildSources(sorteerCatalogus, { ...data, items: [], filmpjes: [], dumpert: [], bronstats: { "tech|d": { vandaag: 5 }, "tech|b": { vandaag: 1 }, "tech|a": { vandaag: null } } });
assert.deepEqual(metStats.groups[0].sources.map((s) => s.id), ["d", "b", "a", "c"]);
assert.deepEqual(metStats.groups.map((g) => [g.id, g.total, g.published]), [["tech", 0, 6]]);

// eerste bron wint bij dubbele alias of host
const dubbelCatalogus: Catalog = {
  groepen: [
    {
      id: "nl",
      label: "Nederland",
      bronnen: [
        { id: "rtl-nieuws", naam: "RTL Nieuws", alias: ["rtl"], hosts: ["rtl.nl"] },
        { id: "rtl-z", naam: "RTL Z", alias: ["rtl"], hosts: ["rtl.nl"] },
        { id: "nhnieuws", naam: "NH Nieuws", hosts: ["nhnieuws.nl", "nh.nl"] },
      ],
    },
  ],
};
const dubbel = buildSources(dubbelCatalogus, null).index;
assert.equal(sourceKey(dubbel, "nl", "RTL", "https://example.org"), "nl|rtl-nieuws");
assert.equal(sourceKey(dubbel, "nl", "", "https://www.rtl.nl/nieuws/1"), "nl|rtl-nieuws");
assert.equal(sourceKey(dubbel, "nl", "RTL Z", "https://www.rtl.nl/z/1"), "nl|rtl-z");

// sourceKey: X-handle, host-terugval alleen bij gelijkende naam, onbekende groep
assert.equal(sourceKey(dubbel, "nl", "X (@NHNieuws)", "https://x.com/NHNieuws/status/1"), "nl|nhnieuws");
assert.equal(sourceKey(dubbel, "nl", "X (@onbekend_account)", "https://x.com/a"), "nl|xonbekendaccount");
assert.equal(sourceKey(dubbel, "nl", "Rtl", "https://rtl.nl/a"), "nl|rtl-nieuws");
assert.equal(sourceKey(dubbel, "nl", "NH", "https://www.nhnieuws.nl/a"), "nl|nh");
assert.equal(sourceKey(dubbel, "nl", "NH", "https://nh.nl/a"), "nl|nhnieuws");
assert.equal(sourceKey(dubbel, "nl", "", "geen url"), "nl|onbekend");
assert.equal(sourceKey(dubbel, "politiek", "RTL Nieuws", "https://rtl.nl/a"), "politiek|rtlnieuws");
assert.equal(sourceKey(dubbel, "onbekend" as "nl", "Dé Bron", "https://rtl.nl/a"), "onbekend|bron");

// bronnen uit data zonder naam: naam valt terug op host of "Onbekend"
const naamloos = buildSources(null, { ...data, items: [], filmpjes: [video("", "https://www.video.example/1"), video("", "geen url")], dumpert: [video("", "https://dumpert.nl/item/2")], bronstats: undefined });
assert.deepEqual(
  naamloos.groups.map((g) => g.sources.map((s) => [s.key, s.naam, s.count, s.fromData])),
  [
    [["filmpjes|onbekend", "Onbekend", 1, true], ["filmpjes|video.example", "video.example", 1, true]],
    [["dumpert|dumpert", "Dumpert", 1, true]],
  ]
);

console.log("sources: tests geslaagd");