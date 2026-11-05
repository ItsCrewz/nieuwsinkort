import { readFile } from "node:fs/promises";
import { relative } from "node:path";

const groepen = {
  feed: ["worker/src/index.ts", "worker/src/parse.ts", "worker/src/cluster.ts", "worker/src/videos.ts", "functions/data.json.ts", "src/feed.tsx", "src/sources.ts", "src/dedup.ts"],
  "tabs/filters": ["src/tabs.ts", "src/filters.tsx", "src/route.ts", "src/slug.ts", "worker/src/tabsam.ts"],
  "samenvatting/Uitgebreid": ["src/uitgebreid.ts", "src/leesverder.ts", "src/sheet.tsx", "worker/src/ai.ts", "worker/src/llm.ts", "worker/src/extractief.ts", "functions/samenvatting.ts", "functions/meer.ts"],
  videopool: ["src/videopool.ts", "src/video.tsx", "src/voorladen.ts", "src/buffer.ts", "src/stall.ts", "src/framegezondheid.ts", "src/ytstart.ts"],
};
const rapport = JSON.parse(await readFile("coverage/coverage-summary.json", "utf8"));
const bestanden = new Map(Object.entries(rapport).filter(([pad]) => pad !== "total").map(([pad, data]) => [relative(process.cwd(), pad), data]));
console.log("\nRegeldekking per groep:");
for (const [naam, paden] of Object.entries(groepen)) {
  let totaal = 0, gedekt = 0;
  for (const pad of paden) {
    const regels = bestanden.get(pad)?.lines;
    if (!regels) throw new Error(`Geen coveragegegevens voor ${pad}`);
    totaal += regels.total;
    gedekt += regels.covered;
  }
  console.log(`${naam}: ${(100 * gedekt / totaal).toFixed(2)}% (${gedekt}/${totaal})`);
}
