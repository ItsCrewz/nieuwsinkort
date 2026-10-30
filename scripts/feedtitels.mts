// Haalt de bronfeeds (alleen lezen) en schrijft kandidaten voor tests/live-cluster.ts.
// Draai: esbuild scripts/feedtitels.mts --bundle --platform=node --format=esm --outfile=/tmp/feedtitels.mjs && node /tmp/feedtitels.mjs <uit.json>
import { readFileSync, writeFileSync } from "node:fs";
import { parseFeed } from "../worker/src/parse";
import { nieuwsRubriek, geselecteerd } from "./feedtitels-selectie";

const UA = "nieuwsinkort/1.0 (+https://nieuwsinkort.pages.dev)";
const B = JSON.parse(readFileSync("public/bronnen.json", "utf8"));
const lijst: { cat: string; site: string; url: string }[] = [];
for (const g of B.groepen) for (const s of g.bronnen) if (!/YouTube|Instagram|Reddit|Podcast/.test(s.info || "")) for (const f of s.feeds || []) lijst.push({ cat: g.id, site: s.naam, url: f.url });
const uit: any[] = [];
let ok = 0, fout = 0;
await Promise.all(lijst.filter((x) => geselecteerd(x.cat) && /^https?:/.test(x.url)).map(async (x) => {
  try {
    const r = await fetch(x.url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) { fout++; return; }
    for (const e of parseFeed(await r.text(), x.url)) if (e.t && e.l && e.d) uit.push({ cat: nieuwsRubriek(x.cat, x.url, e.l, e.t, e.s), site: x.site, href: e.l, t: e.t, s: e.s, d: e.d });
    ok++;
  } catch { fout++; }
}));
const dag = Date.now() - 36 * 3600e3;
const recent = uit.filter((e) => e.d > dag);
writeFileSync(process.argv[2] || "/tmp/feeds.json", JSON.stringify(recent));
console.log(`feeds ok ${ok}, fout ${fout}, items ${recent.length}`);
