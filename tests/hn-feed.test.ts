// Hacker News: de bronnenlijst mag geen news.ycombinator.com/rss bevatten (419 aan Cloudflare-IP's, #413)
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log("✓", name); };

const lees = (p: string) => readFileSync(p, "utf8");

t("bronnenlijst: geen news.ycombinator.com/rss in pipeline en bronnen.json", () => {
  for (const p of ["scripts/pipeline/feeds.json", "scripts/pipeline/feeds_detail.json", "public/bronnen.json"]) {
    assert.ok(!lees(p).includes("news.ycombinator.com/rss"), p);
  }
});

t("bronnenlijst: Hacker News heeft twee hnrss-feeds en behoudt host ycombinator.com", () => {
  const txt = lees("public/bronnen.json");
  assert.ok(txt.includes('"url":"https://hnrss.org/frontpage"') && txt.includes('"url":"https://hnrss.org/best"'));
  assert.ok(/"id":"hackernews","naam":"Hacker News"[^}]*"hosts":\["ycombinator\.com"\]/.test(txt));
});

console.log(`${n} tests ok`);
