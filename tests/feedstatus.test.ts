import { strict as assert } from "node:assert";
import { bewaarFeed, leesFeed, herstelFeed, vastLijst, syncFeed, wisFeed, type FeedStatus } from "../src/feedstatus";
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
assert.deepEqual(herstelFeed(leesFeed(), "dumpert", status.slug, []), { lijst: [], slug: status.slug }); // definitief leeg
wisFeed(); (history as any).state = null; assert.equal(leesFeed(), null);
console.log("feedstatus: geslaagd");

// Lege lijsten en een andere categorie mogen geen oude selectie overnemen.
assert.deepEqual(herstelFeed(null, "dumpert", "onbekend", []), { lijst: [], slug: "onbekend" });
assert.deepEqual(herstelFeed(status, "filmpjes", status.slug, []), { lijst: [], slug: status.slug });
// Uitgesloten bron: alleen actuele, toegestane items; positie op een nog beschikbare video blijft.
assert.deepEqual(herstelFeed(status, "dumpert", status.slug, [lijst[0]]).lijst, [lijst[0]]);
assert.equal(herstelFeed(status, "dumpert", videoSlug(lijst[2]), [lijst[2]]).slug, videoSlug(lijst[2]));
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
// Overgang in VideoGrid: vastgezette lijst volgt de actuele data (verversen, bron uitschakelen).
const vast = vastLijst(null, status, "dumpert", status.slug, lijst)!;
assert.equal(vastLijst(vast, status, "dumpert", status.slug, lijst), vast); // ongewijzigd: zelfde array
assert.deepEqual(vastLijst(vast, status, "dumpert", status.slug, [lijst[2], lijst[0]]), [lijst[0], lijst[2]]); // uitgesloten item weg, volgorde stabiel
const vers = { ...lijst[0], populariteit: "9" } as Video;
assert.equal(vastLijst(vast, status, "dumpert", status.slug, lijst.map((v) => (v === lijst[0] ? vers : v)))![0], vers); // verse gegevens
assert.equal(vastLijst(vast, status, "dumpert", status.slug, []), null); // definitief leeg: niets vasthouden
assert.deepEqual(vastLijst(vast, status, "dumpert", status.slug, [video("nieuw")]).map(videoSlug), [videoSlug(video("nieuw"))]); // niets meer gemeen: nieuwe lijst
console.log("feedstatus-randgevallen: geslaagd");

// Open feed: uitgesloten of verdwenen video's gaan er live uit, actief blijft dezelfde video.
{
  const l = [video("a"), video("b"), video("c"), video("d")];
  assert.equal(syncFeed(l, 2, l).items, l); // ongewijzigd: zelfde array
  const r = syncFeed(l, 2, [l[2], l[3]]);
  assert.deepEqual(r.items, [l[2], l[3]]); assert.equal(r.actief, 0); // eerdere items weg, actieve blijft
  const r2 = syncFeed(l, 2, [l[0], l[1], l[3]]);
  assert.deepEqual(r2.items, [l[0], l[1], l[3]]); assert.equal(r2.actief, 2); // actieve zelf weg: dichtstbijzijnde (volgende)
  const r3 = syncFeed(l, 3, [l[0]]);
  assert.equal(r3.actief, 0); // clamp
  const vers = { ...l[1], bron: "vers" } as Video;
  assert.equal(syncFeed(l, 1, [l[0], vers]).items[1], vers); // verse gegevens, volgorde stabiel
  assert.deepEqual(syncFeed(l, 1, [video("nieuw")]).items, []); // niets gemeen: leeg (component houdt dan vast)
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
