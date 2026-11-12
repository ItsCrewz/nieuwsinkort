// #659: herstel pas op actuele data; een lege of gefilterde actuele lijst brengt nooit oude video's terug.
import assert from "node:assert/strict";
import { herstelFeed, type FeedStatus } from "../../src/feedstatus";
import { videoSlug } from "../../src/slug";
import type { Video } from "../../src/types";

const v = (t: string, bron = "a") => ({ titel: t, href: `https://voorbeeld.nl/${t}`, bron }) as Video;
const [een, twee, drie] = [v("een"), v("twee"), v("drie", "uitgesloten")];
const status: FeedStatus = { cat: "dumpert", slug: videoSlug(twee), soort: "short", positie: 3, speelt: true, lijst: [een, twee, drie] };

// Herladen tijdens laden (null): voorlopig de opgeslagen lijst en slug.
assert.deepEqual(herstelFeed(status, "dumpert", status.slug, null), { lijst: status.lijst, slug: status.slug });
// Definitief lege actuele lijst: geen oude items, geen slug (feed sluit, lege toestand).
assert.deepEqual(herstelFeed(status, "dumpert", status.slug, []), { lijst: [], slug: null });
// Uitgesloten bron: alleen toegestane actuele items, positie landt op de dichtstbijzijnde.
const r = herstelFeed(status, "dumpert", videoSlug(drie), [een, twee]);
assert.deepEqual(r.lijst, [een, twee]);
assert.equal(r.slug, videoSlug(twee));
// Nog beschikbare video behoudt zijn positie.
assert.equal(herstelFeed(status, "dumpert", status.slug, [twee, een]).slug, status.slug);
console.log("✓ videofeed herstelt pas op actuele data (#659)");
