import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { igUser, YT_NIEUWS } from "../worker/src/videos";
import { xUser, X_VIDEO } from "../worker/src/x";
import { onRequest } from "../functions/media/dumpert/[[path]]";

globalThis.window = { location: { href: "https://site.nl/" }, localStorage: { getItem: () => null } } as unknown as Window & typeof globalThis;
const { playerFor, viaProxy } = await import("../src/videosoort");

assert.equal(igUser("https://kg.meowing.de/haarlem105/atom.xml"), "haarlem105");
assert.equal(xUser("https://x.com/RTLnieuws"), "RTLnieuws");
assert.equal(X_VIDEO.RTLnieuws, "RTL Nieuws");
for (const [naam, id] of Object.entries({ Haarlem105: "UCFDVl_p6fwkloGr8lraSZgQ", "De Telegraaf": "UC1Et9K-hHf-P_LzQkE_Q3Jw", GeenStijl: "UCE51aiJ30nQY14kFY021urg" })) assert.equal(YT_NIEUWS[naam], id);
const feeds = JSON.parse(readFileSync("scripts/pipeline/feeds.json", "utf8"));
for (const id of ["UCFDVl_p6fwkloGr8lraSZgQ", "UCxngTZl7im1n_fQYxVh5hXA"]) assert.ok(feeds.some((f: { url: string }) => f.url.includes(id)));
const url = "https://media.dumpert.nl/dmp/media/video/abc/720/test.m3u8";
assert.equal(playerFor({ embed: url, href: "https://dumpert.nl/", titel: "", ai: "", bron: "", thumb: "", populariteit: "", tijd: "" })?.kind, "hls");
assert.equal(viaProxy(url), "/media/dumpert/dmp/media/video/abc/720/test.m3u8");
assert.equal((await onRequest({ request: new Request("https://site.nl/media/dumpert/ongeldig"), params: { path: "ongeldig" } })).status, 404);
console.log("✓ sociale bronnen, YouTube en Dumpert-afspelen");
