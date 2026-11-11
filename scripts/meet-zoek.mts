// Meet zoeken vóór (zonder index) en na (src/zoek.ts) op de echte berichten uit public/data.json, herhaald tot 10.000.
// Gebruik vanaf de repo-root: npx esbuild scripts/meet-zoek.mts --bundle --platform=node --format=esm --outfile=/tmp/meet.mjs && node /tmp/meet.mjs. Stopt met een fout bij afwijkende resultaten of volgorde.
import { readFileSync } from "node:fs";
import { normaliseer, zoekItems } from "../src/zoek";
import type { Item } from "../src/types";

const basis: Item[] = JSON.parse(readFileSync("public/data.json", "utf8")).items;
const items: Item[] = Array.from({ length: 10000 }, (_, i) => ({ ...basis[i % basis.length] }));
const termen = ["a", "am", "ams", "amst", "amste", "amster"];

// Referentie: de oorspronkelijke werkwijze, elke zoekactie alles opnieuw normaliseren.
function referentie(lijst: Item[], query: string): Item[] {
  const afk = (t: string) => t.replace(/(?<![\p{L}\p{N}])(?:\p{L}\.)+\p{L}\.?(?![\p{L}\p{N}])/gu, (a) => a.replace(/\./g, ""));
  const woorden = normaliseer(afk(query)).split(" ").filter(Boolean);
  if (!woorden.length) return lijst;
  return lijst.filter((item) => {
    const o = [item.kop, item.ai, item.samenvatting, ...(item.punten ?? []), ...(item.bronnen ?? []).map((b) => b.site), item.cat].filter(Boolean).join(" ");
    const h = " " + normaliseer(o + " " + afk(o));
    return woorden.every((w) => h.includes(" " + w));
  });
}

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

const voor = meet("voor (referentie)", referentie);
const na = meet("na (zoekItems)", zoekItems);
termen.forEach((q, i) => {
  if (voor[i].length !== na[i].length || voor[i].some((it, j) => it !== na[i][j])) throw new Error(`Afwijkend resultaat of volgorde bij "${q}"`);
  console.log(`"${q}": ${na[i].length} resultaten, volgorde gelijk`);
});
