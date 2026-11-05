// #465: bronnen in tiers bij een cron van elke 5 minuten. Draai: npm run test
import assert from "node:assert/strict";
import { tierVan, jobGroep, draaitMee, ytControleMag, verdeelJobs } from "../worker/src/tier";

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log("✓", name); };
const min = (m: number) => Date.UTC(2026, 10, 2, 9, m, 0);

t("#467 cron */15: elke run is minstens tier 15, social alleen op :00 en :30", () => {
  const tiers = [0, 15, 30, 45].map((m) => tierVan(min(m)));
  assert.deepEqual(tiers, ["30", "15", "30", "15"]);
  for (const x of tiers) assert.ok(draaitMee(x, "zwaar"), x);
  assert.deepEqual(tiers.map((x) => draaitMee(x, "social")), [true, false, true, false]);
});

t("tierVan: minuut % 30 = 30, % 15 = 15, anders 5; zonder geplande tijd alles", () => {
  assert.equal(tierVan(min(0)), "30");
  assert.equal(tierVan(min(30)), "30");
  assert.equal(tierVan(min(15)), "15");
  assert.equal(tierVan(min(45)), "15");
  for (const m of [5, 10, 20, 25, 35, 40, 50, 55]) assert.equal(tierVan(min(m)), "5", `minuut ${m}`);
  assert.equal(tierVan(undefined), "alles");
  assert.equal(tierVan(NaN), "alles");
});

t("jobGroep: core, zwaar (Reddit, YouTube-feeds), social (X, Instagram)", () => {
  assert.equal(jobGroep({ url: "https://nu.nl/rss", kind: "feed" }), "core");
  assert.equal(jobGroep({ url: "https://www.dumpert.nl/toppers", kind: "dumpert" }), "core");
  assert.equal(jobGroep({ url: "https://x/a.json", kind: "json" }), "core");
  assert.equal(jobGroep({ url: "https://x/a", kind: "text" }), "core");
  assert.equal(jobGroep({ url: "https://www.youtube.com/feeds/videos.xml?channel_id=UC1", kind: "feed" }), "zwaar");
  assert.equal(jobGroep({ url: "https://www.reddit.com/r/Haarlem/top/.rss", kind: "reddit" }), "zwaar");
  assert.equal(jobGroep({ url: "https://x.com/nos", kind: "x" }), "social");
  assert.equal(jobGroep({ url: "https://www.instagram.com/nos", kind: "insta" }), "social");
});

t("draaitMee per tier", () => {
  assert.deepEqual((["core", "zwaar", "social"] as const).map((g) => draaitMee("5", g)), [true, false, false]);
  assert.deepEqual((["core", "zwaar", "social"] as const).map((g) => draaitMee("15", g)), [true, true, false]);
  assert.deepEqual((["core", "zwaar", "social"] as const).map((g) => draaitMee("30", g)), [true, true, true]);
  assert.deepEqual((["core", "zwaar", "social"] as const).map((g) => draaitMee("alles", g)), [true, true, true]);
  assert.deepEqual((["5", "15", "30", "alles"] as const).map(ytControleMag), [false, true, true, true]);
});

t("verdeelJobs: overgeslagen bronnen komen uit de cache met cachedAt; zonder verse cache draaien ze toch", () => {
  const jobs = [
    { url: "https://nu.nl/rss", kind: "feed" },
    { url: "https://www.reddit.com/r/a/top/.rss", kind: "reddit" },
    { url: "https://x.com/nos", kind: "x" },
    { url: "https://www.instagram.com/nos", kind: "insta" },
  ];
  const since = 1000;
  const cache = new Map<string, { at: number; r: any }>([
    ["https://www.reddit.com/r/a/top/.rss", { at: 5000, r: { url: "https://www.reddit.com/r/a/top/.rss", ok: true, videos: [1] } }],
    ["https://x.com/nos", { at: 500, r: { url: "https://x.com/nos", ok: true } }], // van vóór middernacht
  ]);
  const v = verdeelJobs(jobs, "5", cache, since);
  assert.deepEqual(v.uitvoeren.map((j) => j.url), ["https://nu.nl/rss", "https://x.com/nos", "https://www.instagram.com/nos"]);
  assert.equal(v.overgeslagen, 1);
  assert.equal(v.uitCache[0].url, "https://www.reddit.com/r/a/top/.rss");
  assert.equal(v.uitCache[0].cachedAt, 5000);
  assert.deepEqual(v.uitCache[0].videos, [1]);
  // 15: core + reddit draaien; x (cache van vóór middernacht) en instagram (geen cache) draaien toch
  assert.equal(verdeelJobs(jobs, "15", cache, since).uitvoeren.length, 4);
  cache.set("https://x.com/nos", { at: 6000, r: { url: "https://x.com/nos", ok: true } });
  cache.set("https://www.instagram.com/nos", { at: 6000, r: { url: "https://www.instagram.com/nos", ok: true } });
  const v15 = verdeelJobs(jobs, "15", cache, since);
  assert.deepEqual(v15.uitvoeren.map((j) => j.url), ["https://nu.nl/rss", "https://www.reddit.com/r/a/top/.rss"]);
  assert.equal(v15.overgeslagen, 2);
  const alles = verdeelJobs(jobs, "alles", cache, since);
  assert.equal(alles.uitvoeren.length, 4);
  assert.equal(alles.overgeslagen, 0);
});

console.log(`${n} tests geslaagd`);
