// Naspeelcheck: bundel met esbuild en geef een data.json-pad en optioneel --nu <ISO> mee.
import { readFileSync } from "node:fs";
import { alleenVandaag } from "../src/vandaag";

const pad = process.argv[2], i = process.argv.indexOf("--nu");
if (!pad || (i >= 0 && !process.argv[i + 1])) throw new Error("Gebruik: live-vandaag <data.json> [--nu <ISO>]");
const now = i < 0 ? Date.now() : Date.parse(process.argv[i + 1]);
if (!Number.isFinite(now)) throw new Error("Ongeldige datum bij --nu");
const data = JSON.parse(readFileSync(pad, "utf8")), uit = alleenVandaag(data, now);
const cats = new Set<string>((data.items || []).map((x: any) => x.cat || "onbekend"));
for (const cat of cats) console.log(`${cat}: ${(data.items || []).filter((x: any) => (x.cat || "onbekend") === cat).length} -> ${uit.items.filter((x: any) => (x.cat || "onbekend") === cat).length}`);
for (const key of ["filmpjes", "dumpert"]) console.log(`${key}: ${(data[key] || []).length} -> ${uit[key].length}`);
console.log(`dag_samenvatting: ${data.dag_samenvatting ? 1 : 0} -> ${uit.dag_samenvatting ? 1 : 0}`);
