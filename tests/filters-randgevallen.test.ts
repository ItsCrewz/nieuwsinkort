// Randgevallen van de pure functies in src/filters.tsx met vaste tijdstempels (geen React, geen echte tijd).
import assert from "node:assert/strict";
import { filterNieuws, filterVideos, regioVan, tijdstip, STANDAARD, type Filters } from "../src/filters";
import type { Item, Video } from "../src/types";

const t = (naam: string, fn: () => void) => { fn(); console.log("✓", naam); };
const origineel = Date.now;
const metNu = (nu: string, fn: () => void) => {
  Date.now = () => Date.parse(nu);
  try { fn(); } finally { Date.now = origineel; }
};
const MIN = 60e3;
const MIDDAG = "2026-10-29T14:00:00+01:00";
const gMiddag = Date.parse(MIDDAG);

const item = (kop: string, tijd: string, extra: Partial<Item> = {}): Item => ({
  kop, tijd, cat: "nl", ai: "", samenvatting: "", punten: [], bronnen: [{ site: "NOS", href: "https://nos.nl/artikel/1" }], ...extra,
});
const video = (titel: string, tijd: string): Video => ({ titel, ai: "", bron: "NOS", href: "https://nos.nl/v/" + titel, thumb: "", populariteit: "", tijd });
const koppen = (l: { kop: string }[]) => l.map((i) => i.kop);

t("tijdstip: gewone tijd, punt als scheiding en seconden worden genegeerd", () => {
  assert.equal(tijdstip("13:30", gMiddag), gMiddag - 30 * MIN);
  assert.equal(tijdstip("9.05", gMiddag), gMiddag - 295 * MIN);
  assert.equal(tijdstip("14:00", gMiddag + 42e3 + 7), gMiddag);
});

t("tijdstip: tot 20 minuten vooruit is nog vandaag, daarna gisteren", () => {
  assert.equal(tijdstip("14:20", gMiddag), gMiddag + 20 * MIN);
  assert.equal(tijdstip("14:21", gMiddag), gMiddag + 21 * MIN - 86400e3);
  assert.equal(tijdstip("23:59", gMiddag), gMiddag + 599 * MIN - 86400e3);
});

t("tijdstip: rond middernacht", () => {
  const gen = Date.parse("2026-10-29T00:10:00+01:00");
  assert.equal(tijdstip("23:50", gen), Date.parse("2026-10-28T23:50:00+01:00"));
  assert.equal(tijdstip("00:05", gen), Date.parse("2026-10-29T00:05:00+01:00"));
  assert.equal(tijdstip("00:30", gen), Date.parse("2026-10-29T00:30:00+01:00"));
  assert.equal(tijdstip("00:31", gen), Date.parse("2026-10-28T00:31:00+01:00"));
  const net = Date.parse("2026-10-28T23:55:00+01:00");
  assert.equal(tijdstip("00:10", net), Date.parse("2026-10-28T00:10:00+01:00"));
});

t("tijdstip: ongeldige of ontbrekende waarden geven null", () => {
  for (const s of [undefined, "", "abc", "9:5", "12-30", "1230", "12:3", "12:300", " 12:30", "12:30 "]) assert.equal(tijdstip(s, gMiddag), null, String(s));
});

t("regioVan: haarlem wint van buitenland en komt ook uit de tekst", () => {
  assert.equal(regioVan(item("x", "", { cat: "haarlem" })), "haarlem");
  assert.equal(regioVan(item("Brand in IJmuiden", "")), "haarlem");
  assert.equal(regioVan(item("x", "", { samenvatting: "In Zandvoort gebeurde iets" })), "haarlem");
  assert.equal(regioVan(item("x", "", { cat: "buitenland", ai: "Bloemendaal" })), "haarlem");
});

t("regioVan: wereld via categorie, bron of url; anders nl", () => {
  assert.equal(regioVan(item("x", "", { cat: "buitenland" })), "wereld");
  assert.equal(regioVan(item("x", "", { bronnen: [{ site: "BBC News", href: "https://bbc.com/a" }] })), "wereld");
  assert.equal(regioVan(item("x", "", { bronnen: [{ site: "Foo", href: "https://foo.nl/Internationaal/a" }] })), "wereld");
  assert.equal(regioVan(item("x", "", { bronnen: [{ site: "Foo", href: "https://foo.nl/internationaalrecht/a" }] })), "nl");
  assert.equal(regioVan(item("Kabinet bespreekt begroting", "")), "nl");
  assert.equal(regioVan({ ...item("Kabinet bespreekt begroting", ""), bronnen: undefined as unknown as Item["bronnen"] }), "nl");
});

t("filterNieuws auto: genoeg van vandaag geeft 'vandaag'", () => metNu(MIDDAG, () => {
  const items = ["08:00", "09:00", "10:00", "11:00", "12:00", "23:00"].map((x, i) => item("k" + i, x));
  const u = filterNieuws(items, STANDAARD, 0, MIDDAG, true);
  assert.equal(u.auto, true);
  assert.equal(u.tijd, "vandaag");
  assert.deepEqual(koppen(u.items), ["k4", "k3", "k2", "k1", "k0"]);
  assert.deepEqual(u.per, { sinds: 6, vandaag: 5, "3u": 2, "1u": 0, alles: 6 });
  assert.equal(u.nieuwSinds, 0);
}));

t("filterNieuws auto: te weinig van vandaag valt terug op 'alles'", () => metNu(MIDDAG, () => {
  const items = ["08:00", "09:00", "10:00", "11:00", "23:00", "22:00"].map((x, i) => item("k" + i, x));
  const u = filterNieuws(items, STANDAARD, 0, MIDDAG, true);
  assert.equal(u.tijd, "alles");
  assert.equal(u.auto, true);
  assert.equal(u.items.length, 6);
  assert.equal(u.per.vandaag, 4);
  assert.deepEqual(filterNieuws([], STANDAARD, 0, MIDDAG, true).items, []);
  assert.equal(filterNieuws([], STANDAARD, 0, MIDDAG, true).tijd, "alles");
}));

t("filterNieuws auto: items zonder tijd tellen niet mee voor 'vandaag' maar blijven zichtbaar", () => metNu(MIDDAG, () => {
  const items = ["08:00", "09:00", "10:00", "11:00", ""].map((x, i) => item("k" + i, x));
  const u = filterNieuws(items, STANDAARD, 0, MIDDAG, true);
  assert.equal(u.tijd, "alles");
  assert.equal(u.per.vandaag, 5);
  assert.equal(koppen(u.items).at(-1), "k4");
}));

t("filterNieuws auto: 'sinds' alleen bij recent bezoek, genoeg nieuw en minder dan alles", () => metNu(MIDDAG, () => {
  const items = ["13:30", "13:20", "13:10", "13:05", "13:02", "09:00", "08:00"].map((x, i) => item("k" + i, x));
  const vorig = gMiddag - 60 * MIN;
  const u = filterNieuws(items, STANDAARD, vorig, MIDDAG, true);
  assert.equal(u.tijd, "sinds");
  assert.equal(u.items.length, 5);
  assert.equal(u.nieuwSinds, 5);
  assert.equal(u.per.sinds, 5);
  // bezoek langer dan 24 uur geleden: geen 'sinds'
  assert.equal(filterNieuws(items, STANDAARD, gMiddag - 25 * 3600e3, MIDDAG, true).tijd, "vandaag");
  // alles is nieuw: geen 'sinds'
  assert.notEqual(filterNieuws(items, STANDAARD, gMiddag - 12 * 3600e3, MIDDAG, true).tijd, "sinds");
  // te weinig nieuw (4)
  assert.notEqual(filterNieuws(items, STANDAARD, gMiddag - 21 * MIN, MIDDAG, true).tijd, "sinds");
}));

t("filterNieuws: expliciete tijd en 'sinds' zonder vorig bezoek", () => metNu(MIDDAG, () => {
  const items = [item("a", "13:30"), item("b", "11:30"), item("c", "09:00"), item("d", "")];
  const per = (tijd: Filters["tijd"], vorig = 0) => filterNieuws(items, { ...STANDAARD, tijd }, vorig, MIDDAG, true);
  assert.deepEqual(koppen(per("1u").items), ["a", "b", "c"].slice(0, 1).concat("d"));
  assert.deepEqual(koppen(per("3u").items), ["a", "b", "d"]);
  assert.deepEqual(koppen(per("sinds").items), ["a", "b", "c", "d"]);
  assert.equal(per("sinds").nieuwSinds, 0);
  assert.equal(per("1u").auto, false);
  assert.deepEqual(per("1u").per, { sinds: 4, vandaag: 4, "3u": 3, "1u": 2, alles: 4 });
}));

t("filterNieuws: cats tellen alleen mee bij alles=true", () => metNu(MIDDAG, () => {
  const items = [item("a", "13:00"), item("b", "13:00", { cat: "tech" })];
  const f: Filters = { ...STANDAARD, tijd: "alles", cats: ["tech"] };
  assert.deepEqual(koppen(filterNieuws(items, f, 0, MIDDAG, true).items), ["b"]);
  assert.deepEqual(koppen(filterNieuws(items, f, 0, MIDDAG, false).items), ["a", "b"]);
}));

t("filterNieuws: regio, video en samen combineren met EN; per telt na die filters", () => metNu(MIDDAG, () => {
  const bron2 = [{ site: "NOS", href: "https://nos.nl/video/1" }, { site: "RTL", href: "https://rtl.nl/a" }];
  const items = [
    item("haarlem-video", "13:00", { cat: "haarlem", bronnen: bron2 }),
    item("haarlem-plat", "13:00", { cat: "haarlem" }),
    item("wereld-video", "13:00", { cat: "buitenland", bronnen: bron2 }),
    item("nl-video", "13:00", { bronnen: bron2 }),
    item("nl-enkel-video", "13:00", { bronnen: [{ site: "NOS", href: "https://nos.nl/video/2" }] }),
  ];
  const doe = (extra: Partial<Filters>) => filterNieuws(items, { ...STANDAARD, tijd: "alles", ...extra }, 0, MIDDAG, true);
  assert.deepEqual(koppen(doe({ regio: ["haarlem", "wereld"] }).items).sort(), ["haarlem-plat", "haarlem-video", "wereld-video"]);
  assert.deepEqual(koppen(doe({ regio: ["haarlem"], video: true }).items), ["haarlem-video"]);
  assert.deepEqual(koppen(doe({ video: true, samen: true, regio: ["nl"] }).items), ["nl-video"]);
  assert.deepEqual(koppen(doe({ samen: true }).items).sort(), ["haarlem-video", "nl-video", "wereld-video"]);
  assert.deepEqual(doe({ video: true, regio: ["wereld"] }).per, { sinds: 1, vandaag: 1, "3u": 1, "1u": 1, alles: 1 });
  assert.deepEqual(koppen(doe({ regio: ["haarlem"], cats: ["tech"] }).items), []);
}));

t("filterNieuws: sorteringen, gelijke stand en per op een eigen lijst", () => metNu(MIDDAG, () => {
  const twee = [{ site: "NOS", href: "https://a.nl/1" }, { site: "RTL", href: "https://b.nl/1" }];
  const drie = [...twee, { site: "AD", href: "https://c.nl/1" }];
  const items = [item("a", "10:00"), item("b", "12:00", { bronnen: twee }), item("c", "11:00", { bronnen: drie }), item("d", "12:00", { bronnen: twee })];
  const sort = (s: Filters["sort"]) => koppen(filterNieuws(items, { ...STANDAARD, tijd: "alles", sort: s }, 0, MIDDAG, true).items);
  assert.deepEqual(sort("nieuw"), ["b", "d", "c", "a"]);
  assert.deepEqual(sort("oud"), ["a", "c", "b", "d"]);
  assert.deepEqual(sort("bronnen"), ["c", "b", "d", "a"]);
}));

t("filterVideos: lege lijst en tijdkeuzes", () => metNu(MIDDAG, () => {
  for (const tijd of ["auto", "alles", "1u", "3u", "vandaag", "sinds"] as const) assert.deepEqual(filterVideos([], { ...STANDAARD, tijd }, 0, MIDDAG), []);
  const lijst = [video("a", "13:30"), video("b", "11:00"), video("c", "23:00"), video("d", "")];
  const kies = (tijd: Filters["tijd"], vorig = 0) => filterVideos(lijst, { ...STANDAARD, tijd }, vorig, MIDDAG).map((v) => v.titel);
  assert.deepEqual(kies("alles"), ["a", "b", "c", "d"]);
  assert.deepEqual(kies("auto"), ["a", "b", "c", "d"]); // minder dan 5 van vandaag: alles
  assert.deepEqual(kies("vandaag"), ["a", "b", "d"]);
  assert.deepEqual(kies("1u"), ["a", "d"]);
  assert.deepEqual(kies("sinds"), ["a", "b", "c", "d"]);
  assert.deepEqual(kies("sinds", gMiddag - 60 * MIN), ["a", "d"]);
  const veel = ["08:00", "09:00", "10:00", "11:00", "12:00", "23:00"].map((x, i) => video("v" + i, x));
  assert.deepEqual(filterVideos(veel, STANDAARD, 0, MIDDAG).map((v) => v.titel), ["v0", "v1", "v2", "v3", "v4"]);
}));
