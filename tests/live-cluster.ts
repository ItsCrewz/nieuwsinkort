// Naspeel-check clusteren: node (na esbuild) tests/live-cluster.ts <data.json | feeds.json>
// Draait de OUDE (kopie van vóór #38) en NIEUWE clustering en print wat nieuw samengaat.
// Invoer: data.json ({items}) of een lijst {cat, site, href, t, s, d} (zie scripts/feedtitels.mts).
import { readFileSync } from "node:fs";
import { cluster, normLink, type Cand } from "../worker/src/cluster";

const STOP = new Set("de het een en van in op te voor met is zijn er dat die bij uit aan om ook als naar over na door nog niet wel maar dan was wordt worden heeft hebben meer dit deze tot kan nu zo al wat hoe waar wie ze hij zij we je jij u the a an of to in on for with and is are was be at by from as it its this that after over new says will has have can how why what who".split(" "));
const toksOud = (s: string) => new Set(s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)));
function simOud(a: Set<string>, b: Set<string>) { let n = 0; for (const x of a) if (b.has(x)) n++; return { n, j: n / (a.size + b.size - n || 1) }; }
function clusterOud(cands: Cand[]) {
  const out: { c: Cand[]; tok: Set<string> }[] = [];
  for (const c of [...cands].sort((a, b) => a.d - b.d)) {
    const tk = toksOud(c.t);
    let best: (typeof out)[number] | null = null, bj = 0;
    for (const k of out) { const { n, j } = simOud(tk, k.tok); if ((j >= 0.45 && n >= 2) || (n >= 4 && j >= 0.3)) if (j > bj) { bj = j; best = k; } }
    if (best) { best.c.push(c); for (const x of tk) best.tok.add(x); } else out.push({ c: [c], tok: tk });
  }
  return out.map((k) => k.c);
}

const D = JSON.parse(readFileSync(process.argv[2] || "/tmp/live.json", "utf8"));
const cands: Cand[] = Array.isArray(D) ? D : (D.items || []).map((i: any, x: number) => {
  const [h, m] = String(i.tijd || "00:00").split(":").map(Number);
  const b = i.bronnen?.[0] || {};
  return { cat: i.cat, site: b.site || "", href: b.href || `item:${x}`, t: i.kop, s: [i.ai, i.samenvatting].filter(Boolean).join(" "), d: (h * 60 + m) * 60000 + x };
});
// ontdubbel op href, zoals de Worker
{ const gezien = new Set<string>(); for (let i = cands.length - 1; i >= 0; i--) { const k = normLink(cands[i].href); if (gezien.has(k)) cands.splice(i, 1); else gezien.add(k); } }
const groepen = (g: Cand[][]) => new Map(g.map((c) => [c.map((x) => normLink(x.href)).sort().join("|"), c]));
const oud = clusterOud(cands.map((c) => ({ ...c })));
const nieuw = cluster(cands.map((c) => ({ ...c }))).map((k) => k.c);
const oudId = new Map<string, number>();
oud.forEach((g, i) => g.forEach((c) => oudId.set(normLink(c.href), i)));
console.log(`kandidaten ${cands.length}; clusters oud ${oud.length} -> nieuw ${nieuw.length}`);
let nieuwSamen = 0;
for (const g of nieuw) {
  if (new Set(g.map((c) => oudId.get(normLink(c.href)))).size < 2) continue;
  nieuwSamen++;
  console.log("NIEUW SAMEN:");
  for (const c of g) console.log(`   [${c.cat}] ${c.site}: ${c.t}`);
}
const o = groepen(oud), n = groepen(nieuw);
const verloren = [...o.keys()].filter((k) => !n.has(k) && o.get(k)!.length > 1);
console.log(`nieuw samengevoegde groepen: ${nieuwSamen}; oude groepen die niet meer bestaan: ${verloren.length}`);
