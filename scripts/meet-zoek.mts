// Meet zoeken vóór (echte src/zoek.ts van origin/main, zonder index) en na (werkboom) op de echte berichten uit public/data.json, herhaald tot 10.000.
// Bundel beide versies met esbuild (voor: `git show origin/main:src/zoek.ts` tijdelijk als src/zoek.voor.ts), dan:
//   npx esbuild scripts/meet-zoek.mts --bundle --platform=node --format=esm --packages=external --outfile=/tmp/meet.mjs && node /tmp/meet.mjs <voor.mjs> <na.mjs>
// Stopt met een fout bij afwijkende resultaten of volgorde.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import type { Item } from "../src/types";

type Zoek = { zoekItems: (l: Item[], q: string) => Item[] };
const [voorPad, naPad] = process.argv.slice(2);
if (!voorPad || !naPad) throw new Error("Geef de bundels voor en na op als argumenten.");
const voorMod: Zoek = await import(pathToFileURL(voorPad).href);
const naMod: Zoek = await import(pathToFileURL(naPad).href);

const basis: Item[] = JSON.parse(readFileSync("public/data.json", "utf8")).items;
const items: Item[] = Array.from({ length: 10000 }, (_, i) => ({ ...basis[i % basis.length] }));
// Naast woordbegin-termen ook de regels van #804 (jaartal), #809 (meerdere termen) en #811 (koppelteken).
const termen = ["a", "am", "ams", "amst", "amste", "amster", "2026", "2025", "ajax feyenoord", "k.n.m.i.", "wereld-kampioen", "wereldkampioen", "s"];

function meet(naam: string, f: (l: Item[], q: string) => Item[]) {
  const orig = String.prototype.normalize;
  let n = 0;
  String.prototype.normalize = function (this: string, ...a: []) { n++; return orig.apply(this, a); };
  const t0 = performance.now();
  const uit = termen.map((q) => f(items, q));
  const ms = performance.now() - t0;
  String.prototype.normalize = orig;
  console.log(`${naam}: ${n} normalisaties, ${ms.toFixed(0)} ms`);
  return uit;
}

const voor = meet("voor (origin/main)", voorMod.zoekItems);
const na = meet("na (werkboom)", naMod.zoekItems);
termen.forEach((q, i) => {
  if (voor[i].length !== na[i].length || voor[i].some((it, j) => it !== na[i][j])) throw new Error(`Afwijkend resultaat of volgorde bij "${q}"`);
  console.log(`"${q}": ${na[i].length} resultaten, volgorde gelijk`);
});
