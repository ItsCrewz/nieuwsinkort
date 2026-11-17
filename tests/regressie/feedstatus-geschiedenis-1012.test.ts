import assert from "node:assert/strict";
import { herstelFeed, leesFeed, type FeedStatus } from "../../src/feedstatus";
import { videoSlug } from "../../src/slug";
import type { Video } from "../../src/types";

const video = { titel: "Terugkeer", href: "https://voorbeeld.nl/terugkeer", bron: "test" } as Video;
const geschiedenis: FeedStatus = { cat: "dumpert", slug: videoSlug(video), soort: "short", positie: 42, speelt: true, lijst: [video] };
const sessie = { ...geschiedenis, positie: 17 };
Object.assign(globalThis, { history: { state: { feed: geschiedenis } } });

for (const getItem of [() => "{", () => JSON.stringify({ ...sessie, lijst: null }), () => { throw new Error("opslag geblokkeerd"); }]) {
  Object.assign(globalThis, { sessionStorage: { getItem } });
  const status = leesFeed();
  assert.deepEqual(status, geschiedenis);
  assert.deepEqual(herstelFeed(status, "dumpert", geschiedenis.slug, null), { lijst: [video], slug: geschiedenis.slug });
}
Object.assign(globalThis, { sessionStorage: { getItem: () => JSON.stringify(sessie) } });
assert.deepEqual(leesFeed(), sessie);
Object.assign(globalThis, { sessionStorage: { getItem: () => "{" }, history: { state: { feed: { ...geschiedenis, lijst: null } } } });
assert.equal(leesFeed(), null);
assert.deepEqual(herstelFeed(leesFeed(), "dumpert", geschiedenis.slug, null), { lijst: [], slug: geschiedenis.slug });
console.log("✓ feedherstel gebruikt geldige geschiedenis bij corrupte sessiestatus (#1012)");
