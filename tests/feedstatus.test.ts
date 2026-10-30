import { strict as assert } from "node:assert";
import { bewaarFeed, leesFeed, herstelFeed, wisFeed, type FeedStatus } from "../src/feedstatus";
import { videoSlug } from "../src/slug";
import type { Video } from "../src/types";
const opslag = new Map<string, string>();
Object.assign(globalThis, { sessionStorage: { getItem: (k: string) => opslag.get(k) ?? null, setItem: (k: string, v: string) => opslag.set(k, v), removeItem: (k: string) => opslag.delete(k) }, history: { state: { ander: 1 } as unknown, replaceState(s: unknown) { this.state = s; } } });
const video = (titel: string) => ({ titel, href: `https://voorbeeld.nl/${titel}`, bron: "test" }) as Video;
const lijst = [video("een"), video("twee"), video("drie")];
const status: FeedStatus = { cat: "dumpert", slug: videoSlug(lijst[1]), soort: "short", positie: 12, speelt: true, lijst };
bewaarFeed(status);
assert.deepEqual(leesFeed(), status);
assert.deepEqual((history.state as any).feed, status);
assert.equal(herstelFeed(leesFeed(), "dumpert", status.slug, [lijst[0], lijst[2]]).slug, videoSlug(lijst[2]));
assert.equal(herstelFeed(leesFeed(), "dumpert", status.slug, []).lijst.length, 3);
assert.equal(herstelFeed(leesFeed(), "dumpert", status.slug, []).slug, status.slug);
wisFeed(); (history as any).state = null; assert.equal(leesFeed(), null);
console.log("feedstatus: geslaagd");

// Lege lijsten en een andere categorie mogen geen oude selectie overnemen.
assert.deepEqual(herstelFeed(null, "dumpert", "onbekend", []), { lijst: [], slug: "onbekend" });
assert.deepEqual(herstelFeed(status, "filmpjes", status.slug, []), { lijst: [], slug: status.slug });
assert.equal(herstelFeed(status, "dumpert", "onbekend", lijst).slug, videoSlug(lijst[0]));
assert.equal(herstelFeed(status, "dumpert", videoSlug(lijst[2]), [lijst[0]]).slug, videoSlug(lijst[0]));
assert.equal(herstelFeed(status, "dumpert", status.slug, [lijst[2], lijst[1]]).slug, status.slug);

// Ontbrekende, ongeldige en ontoegankelijke opslag volgt de bestaande fallback.
(history as any).state = { feed: status };
assert.deepEqual(leesFeed(), status);
opslag.set("nieuwsinkort-feedstatus", "null");
assert.deepEqual(leesFeed(), status);
opslag.set("nieuwsinkort-feedstatus", "{");
assert.equal(leesFeed(), null);
for (const ongeldig of [{ ...status, cat: "anders" }, { ...status, slug: null }, { ...status, lijst: null }]) {
  opslag.set("nieuwsinkort-feedstatus", JSON.stringify(ongeldig));
  assert.equal(leesFeed(), null);
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
