import { strict as assert } from "node:assert";
import { bewaarFeed, leesFeed, herstelFeed, startIndex, wisFeed, type FeedStatus } from "../src/feedstatus";
import { videoSlug } from "../src/slug";
import type { Video } from "../src/types";
const opslag = new Map<string, string>();
Object.assign(globalThis, { sessionStorage: { getItem: (k: string) => opslag.get(k) ?? null, setItem: (k: string, v: string) => opslag.set(k, v), removeItem: (k: string) => opslag.delete(k) }, history: { state: { ander: 1 } as unknown, replaceState(s: unknown) { this.state = s; } } });
const video = (titel: string) => ({ titel, href: `https://voorbeeld.nl/${titel}`, bron: "test" }) as Video;
const lijst = [video("een"), video("twee"), video("drie")];
const status: FeedStatus = { cat: "dumpert", slug: videoSlug(lijst[1]), soort: "short", positie: 12, speelt: true, lijst };
bewaarFeed(status);
assert.deepEqual(leesFeed(), status);
assert.deepEqual((history.state as { feed?: unknown }).feed, status);
assert.equal(herstelFeed(leesFeed(), "dumpert", status.slug, [lijst[0], lijst[2]]).slug, videoSlug(lijst[2]));
assert.equal(herstelFeed(leesFeed(), "dumpert", status.slug, null).lijst.length, 3);
assert.equal(herstelFeed(leesFeed(), "dumpert", status.slug, null).slug, status.slug);
wisFeed(); (history as any).state = null; assert.equal(leesFeed(), null);
console.log("feedstatus: geslaagd");

// Lege lijsten en een andere categorie mogen geen oude selectie overnemen.
assert.deepEqual(herstelFeed(null, "dumpert", "onbekend", null), { lijst: [], slug: "onbekend" });
assert.deepEqual(herstelFeed(status, "filmpjes", status.slug, null), { lijst: [], slug: status.slug });
assert.equal(herstelFeed(status, "dumpert", "onbekend", lijst).slug, videoSlug(lijst[0]));
assert.equal(herstelFeed(status, "dumpert", videoSlug(lijst[2]), [lijst[0]]).slug, videoSlug(lijst[0]));
assert.equal(herstelFeed(status, "dumpert", status.slug, [lijst[2], lijst[1]]).slug, status.slug);

// Ontbrekende, ongeldige en ontoegankelijke opslag volgt de bestaande fallback.
(history as any).state = { feed: status };
assert.deepEqual(leesFeed(), status);
opslag.set("nieuwsinkort-feedstatus", "null");
assert.deepEqual(leesFeed(), status);
opslag.set("nieuwsinkort-feedstatus", "{");
assert.deepEqual(leesFeed(), status);
for (const ongeldig of [{ ...status, cat: "anders" }, { ...status, slug: null }, { ...status, lijst: null }]) {
  opslag.set("nieuwsinkort-feedstatus", JSON.stringify(ongeldig));
  assert.deepEqual(leesFeed(), status);
}
const oorspronkelijkeOpslag = globalThis.sessionStorage;
const oorspronkelijkeGeschiedenis = globalThis.history;
try {
  Object.assign(globalThis, { sessionStorage: {
    getItem() { throw new Error("opslag uit"); },
    setItem() { throw new Error("opslag uit"); },
    removeItem() { throw new Error("opslag uit"); },
  }, history: { state: null, replaceState() { throw new Error("geschiedenis uit"); } } });
  assert.equal(leesFeed(), null);
  assert.doesNotThrow(() => bewaarFeed(status));
  assert.doesNotThrow(() => wisFeed());
} finally {
  Object.assign(globalThis, { sessionStorage: oorspronkelijkeOpslag, history: oorspronkelijkeGeschiedenis });
}
console.log("feedstatus-randgevallen: geslaagd");

// #687: dubbelzinnige oude titelroute opent geen willekeurige video; hash botst niet op bekende FNV-botsing.
{
  const a = { titel: "Zelfde", href: "https://example.com/a/1" } as any, b = { titel: "Zelfde", href: "https://example.com/a/2" } as any;
  assert.equal(herstelFeed(null, "dumpert", "zelfde", [a, b]).slug, null);
  // Geopende video: dubbelzinnige oude route opent niets; eigen sleutel precies die video; titelwijziging behoudt de sleutel.
  const lst = [a, b];
  const r0 = herstelFeed(null, "dumpert", "zelfde", lst);
  assert.equal(r0.slug, null);
  const sb = videoSlug(b);
  assert.equal(lst[startIndex(lst, herstelFeed(null, "dumpert", sb, lst).slug)], b);
  const gewijzigd = [a, { ...b, titel: "Anders" }];
  assert.equal(gewijzigd[startIndex(gewijzigd, herstelFeed(null, "dumpert", sb, gewijzigd).slug)].titel, "Anders");
  // Oude route met één treffer opent die video; yt-/d-video's blijven op hun eigen id.
  const c = { titel: "Uniek", href: "https://example.com/a/3" } as any;
  assert.equal(lst.concat(c)[startIndex(lst.concat(c), herstelFeed(null, "dumpert", "uniek", lst.concat(c)).slug)], c);
  const yt = { titel: "T", href: "https://www.youtube.com/watch?v=abcdefghijk" } as any, dp = { titel: "T", href: "https://www.dumpert.nl/item/123_abc" } as any;
  for (const v of [yt, dp]) assert.equal([a, v, b][startIndex([a, v, b], herstelFeed(null, "dumpert", videoSlug(v), [a, v, b]).slug)], v);
  assert.notEqual(videoSlug({ titel: "x", href: "https://example.com/video/9h5kto" } as any), videoSlug({ titel: "x", href: "https://example.com/video/b2yzyf" } as any));
}
// Wissen haalt de status uit beide opslagplaatsen en laat andere geschiedenisvelden staan (#802).
{
  const g = new Map<string, string>();
  const staat = { sessionStorage: { getItem: (k: string) => g.get(k) ?? null, setItem: (k: string, v: string) => g.set(k, v), removeItem: (k: string) => g.delete(k) }, history: { state: { ander: 1 } as unknown, replaceState(s: unknown) { this.state = s; } } };
  Object.assign(globalThis, staat);
  bewaarFeed(status);
  wisFeed();
  assert.equal(leesFeed(), null);
  assert.deepEqual(history.state, { ander: 1 });
  // geblokkeerde sessionStorage: geschiedenis wordt toch gewist
  bewaarFeed(status);
  Object.assign(globalThis, { sessionStorage: { getItem() { throw new Error("uit"); }, setItem() { throw new Error("uit"); }, removeItem() { throw new Error("uit"); } } });
  wisFeed();
  assert.equal((history.state as { feed?: unknown }).feed, undefined);
  assert.equal((history.state as { ander?: number }).ander, 1);
  // geschiedenis geblokkeerd: sessionStorage wordt toch gewist
  Object.assign(globalThis, { sessionStorage: staat.sessionStorage, history: { state: { feed: status }, replaceState() { throw new Error("uit"); } } });
  g.set("nieuwsinkort-feedstatus", JSON.stringify(status));
  wisFeed();
  assert.equal(g.has("nieuwsinkort-feedstatus"), false);
}
console.log("feedstatus-wissen: geslaagd");
