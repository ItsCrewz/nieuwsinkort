// Ontdubbel-check op echte data: node (na esbuild) tests/live-dedup.ts <data.json>
import { readFileSync } from "node:fs";
import { dedupVideos } from "../src/dedup";
const D = JSON.parse(readFileSync(process.argv[2] || "/tmp/live.json", "utf8"));
const d = dedupVideos(D.dumpert || []);
const f = dedupVideos(D.filmpjes || [], d.list);
console.log("filmpjes", D.filmpjes?.length, "->", f.list.length, "weg:", f.removed, "| dumpert", D.dumpert?.length, "->", d.list.length, "weg:", d.removed);
for (const g of [...d.groups, ...f.groups]) console.log("  ", g.join("  ||  "));
const items = D.items || [];
console.log("berichten", items.length, "met foto", items.filter((i: any) => i.beeld || i.beelden?.length).length);
