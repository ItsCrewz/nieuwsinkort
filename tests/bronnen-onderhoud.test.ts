// Bronnenlijst (#448): vervangen/verwijderde feeds en het padveld voor de Alarmeringen-sitemap.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { igUser } from "../worker/src/videos";

type Feed = { naam: string; url: string; werkt?: boolean; pad?: string };
const feeds: Feed[] = JSON.parse(readFileSync("scripts/pipeline/feeds.json", "utf8"));
const bronnen = JSON.parse(readFileSync("public/bronnen.json", "utf8"));
const urls = feeds.map((f) => f.url);
const live: string[] = bronnen.groepen.flatMap((g: any) => g.bronnen.flatMap((s: any) => (s.feeds || []).map((f: any) => f.url)));

for (const u of ["https://www.rtlz.nl/rss", "https://alarmeringen.nl/noord-holland/kennemerland/rss", "https://www.computable.nl/rss.xml", "https://www.computable.nl/rss/nieuws", "https://www.computable.nl/atom.xml",
  "https://www.politie.nl/rss.xml", "https://www.politie.nl/nieuws/rss", "https://x.com/POL_Haarlem", "https://kg.meowing.de/powned/atom.xml",
  "https://www.youtube.com/feeds/videos.xml?channel_id=UCsmqf-MUzYyVzF5DYtdL2FA", "https://www.youtube.com/feeds/videos.xml?channel_id=UCzlQ9dqrRn10tHxU9BvqSTQ", "https://www.youtube.com/feeds/videos.xml?channel_id=UC3lleI2WsaIiW8IzkJ0kIYA"]) assert.ok(!urls.includes(u), u);
for (const u of ["https://www.rtl.nl/nieuws/economie/rss.xml", "https://alarmeringen.nl/sitemap-news.xml", "https://www.computable.nl/feed/", "https://kg.meowing.de/omroeppowned/atom.xml",
  "https://www.youtube.com/feeds/videos.xml?channel_id=UCefm-CCsWsWWQeCYf1Ozp_g", "https://www.youtube.com/feeds/videos.xml?channel_id=UCZean7nAZKDGIHANq-MuaGA",
  "https://www.youtube.com/feeds/videos.xml?channel_id=UCWALr0VavEm8SgPXGafhFDQ"]) assert.ok(live.includes(u), u);

// RTL Z blijft één bron (id rtlz) met alleen de economie-RSS (YouTube-kanaal geschrapt)
const rtlz = bronnen.groepen.flatMap((g: any) => g.bronnen).filter((s: any) => s.id === "rtlz");
assert.equal(rtlz.length, 1);
assert.equal(rtlz[0].feeds.length, 1)
assert.equal(rtlz[0].feeds[0].url, "https://www.rtl.nl/nieuws/economie/rss.xml");

// pad gaat van feeds.json via bronnen.json naar de Worker
const alarm = bronnen.groepen.flatMap((g: any) => g.bronnen).flatMap((s: any) => s.feeds || []).find((f: any) => f.url === "https://alarmeringen.nl/sitemap-news.xml");
assert.equal(alarm?.pad, "/noord-holland/kennemerland/");
assert.equal(live.filter((u) => u.includes("POL_Haarlem")).length, 0);
assert.equal(igUser("https://kg.meowing.de/omroeppowned/atom.xml"), "omroeppowned");
console.log("✓ bronnenlijst #448: groep A en B");
