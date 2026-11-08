import assert from "node:assert/strict";
import { herstelFeed, leesFeed, type FeedStatus } from "../../src/feedstatus";
import { videoSlug } from "../../src/slug";
import type { Video } from "../../src/types";

const video = { titel: "Terugkeer", href: "https://voorbeeld.nl/terugkeer", bron: "test" } as Video;
const status: FeedStatus = { cat: "dumpert", slug: videoSlug(video), soort: "short", positie: 42, speelt: true, lijst: [video] };
const sessie = { ...status, positie: 17 };
Object.assign(globalThis, { history: { state: { feed: status } } });

for (const getItem of [() => { throw new Error("opslag geblokkeerd"); }, () => "{"]) {
  Object.assign(globalThis, { sessionStorage: { getItem } });
  const opgeslagen = leesFeed();
  assert.deepEqual(opgeslagen, status);
  assert.equal(herstelFeed(opgeslagen, "dumpert", status.slug, []).slug, status.slug);
  assert.equal(opgeslagen?.positie, 42);
}
Object.assign(globalThis, { sessionStorage: { getItem: () => JSON.stringify(sessie) } });
assert.deepEqual(leesFeed(), sessie);
Object.assign(globalThis, { sessionStorage: { getItem: () => "{" }, history: { state: null } });
assert.equal(leesFeed(), null);
assert.deepEqual(herstelFeed(null, "dumpert", status.slug, []), { lijst: [], slug: status.slug });
console.log("✓ videostatus valt bij opslagfouten terug op de geschiedenis (#732)");
