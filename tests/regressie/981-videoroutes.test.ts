import assert from "node:assert/strict";
import { onRequestGet, onRequestPost } from "../../functions/samenvatting";
import { herstelFeed, startIndex, type FeedStatus } from "../../src/feedstatus";
import { svCache, zaaiSamenvattingen } from "../../src/samenvattingcache";
import { oudeSlug, svSleutel, videoSlug, vindSlug } from "../../src/slug";
import { startSoortRoute } from "../../src/videosoort";
import { volgorde } from "../../worker/src/vooraf";
import type { Video } from "../../src/types";

// Twee verschillende links met gelijke titel bootsen de botsing na; de YouTube-link komt uit de bestaande livefixture.
const a = { titel: "Dezelfde titel", href: "https://example.com/video/1", bron: "test" } as Video;
const b = { ...a, href: "https://example.com/video/2" };
const yt = { ...a, href: "https://www.youtube.com/shorts/fDsyJufbePY" };
const lijst = [a, b, yt], ids = lijst.map(videoSlug);
assert.equal(new Set(ids).size, 3);
assert.equal(videoSlug({ ...b, titel: "Gewijzigde titel" }), ids[1]);
assert.equal(ids[2], "yt-fDsyJufbePY");
assert.equal(vindSlug(lijst, oudeSlug(a)), null);
for (const [href, slug] of [
  ["https://www.dumpert.nl/item/123456_abc", "d-123456_abc"],
  ["https://x.com/nieuws/status/123456789", "x-123456789"],
  ["https://www.reddit.com/r/videos/comments/abc123/bericht", "r-abc123"],
  ["https://www.instagram.com/reel/Abc_123/", "ig-Abc_123"],
]) {
  const video = { ...a, href };
  assert.equal(videoSlug(video), slug);
  assert.equal(vindSlug([video], slug), video);
}
const short = { ...a, soort: "short" as const };
const journaal = { ...b, soort: "journaal" as const };
const uniek = { ...journaal, titel: "Uniek journaal", href: "https://example.com/video/3" };
const tablijst = [short, journaal, uniek];
for (const [route, verwacht] of [[videoSlug(short), "short"], [videoSlug(journaal), "journaal"], [oudeSlug(uniek), "journaal"]] as const) {
  const start = herstelFeed(null, "filmpjes", route, tablijst).slug;
  assert.equal(startSoortRoute(tablijst, start), verwacht);
}

const status: FeedStatus = { cat: "filmpjes", slug: ids[1], soort: "short", positie: 12, speelt: true, lijst };
for (const opgeslagen of [null, status]) {
  const actueel = [{ ...b, titel: "Nieuwe titel" }, a, yt];
  const start = herstelFeed(opgeslagen, "filmpjes", ids[1], actueel).slug;
  assert.equal(actueel[startIndex(actueel, start)].href, b.href);
}
assert.deepEqual(volgorde({ filmpjes: [a, b], dumpert: [] }).map((v) => videoSlug(v as Video)), ids.slice(0, 2));

const eerste = { ok: true, punten: ["Eerste video"], bron: "spraak" as const };
const tweede = { ok: true, punten: ["Tweede video"], bron: "spraak" as const };
zaaiSamenvattingen({ [ids[0]]: eerste, [ids[1]]: tweede });
assert.deepEqual(svCache.get(ids[0]), { ...eerste, sec: undefined, cached: true });
assert.deepEqual(svCache.get(ids[1]), { ...tweede, sec: undefined, cached: true });
const opslag = new Map([[svSleutel(ids[0]), eerste], [svSleutel(ids[1]), tweede]]);
const env: any = { NIEUWS: { get: async (key: string) => opslag.get(key) ?? null } };
for (const [i, verwacht] of [eerste, tweede].entries()) {
  const get = await onRequestGet({ request: new Request(`https://nieuwsinkort.test/samenvatting?id=${ids[i]}`), env });
  assert.deepEqual((await get.json() as typeof eerste).punten, verwacht.punten);
  const post = await onRequestPost({ request: new Request("https://nieuwsinkort.test/samenvatting", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: ids[i] }) }), env });
  assert.deepEqual((await post.json() as typeof eerste).punten, verwacht.punten);
}
console.log("videoroutes en samenvattingscache #981: geslaagd");
