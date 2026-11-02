// Replay #443: vergelijkt de samenvoeglogica van main (oud) met die van deze branch (nieuw) op bevroren data.json-bestanden.
// Artikelen worden uit items[].bronnen (+ kop/cat) gereconstrueerd; feedtitels staan er niet in (ft) en worden dan uit de URL-slug benaderd.
// Gebruik: node scripts/replay-443.mjs <rapport.md> <data.json> [data.json…] — vergelijkt origin/main met de werkboom; leest alleen lokale bestanden, geen netwerk, geen AI.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "esbuild";

const [RAPPORT, ...BESTANDEN] = process.argv.slice(2);
if (!RAPPORT || !BESTANDEN.length) { console.error("Gebruik: node scripts/replay-443.mjs <rapport.md> <data.json> [data.json…]"); process.exit(1); }
const root = new URL("..", import.meta.url).pathname;
const tmp = mkdtempSync(join(tmpdir(), "replay443-"));

// oude versie: worker/src en src van main uitpakken
const oudDir = join(tmp, "oud");
mkdirSync(oudDir);
execFileSync("sh", ["-c", `git -C ${root} archive origin/main worker/src src | tar -x -C ${oudDir}`]);
const laad = async (dir, naam) => {
  const uit = join(tmp, `${naam}.mjs`);
  await build({ entryPoints: [join(dir, "worker/src/cluster.ts")], bundle: true, platform: "node", format: "esm", outfile: uit, logLevel: "error" });
  const sd = join(tmp, `${naam}-sd.mjs`);
  await build({ entryPoints: [join(dir, "worker/src/sportdubbel.ts")], bundle: true, platform: "node", format: "esm", outfile: sd, logLevel: "error" });
  return { ...(await import(uit)), ...(await import(sd)) };
};
const oud = await laad(oudDir, "oud"), nieuw = await laad(root, "nieuw");

const slug = (h) => (h.split("/").filter(Boolean).pop() || "").replace(/\.html$/, "").replace(/~.*$/, "").replace(/^\d+-?/, "").replace(/-/g, " ");
const sig = (k) => k.c.map((c) => c.href).sort().join("|");
const exactBron = (k) => [...new Map(k.c.map((c) => [c.site, c])).values()]; // zoals main in index.ts
const nBron = (m, k) => (m.eenPerUitgever ? m.eenPerUitgever(k.c) : exactBron(k));

let md = `# Replay #443 — oude (main) vs nieuwe samenvoeglogica\n\nGegenereerd door \`scripts/replay-443.mjs\`. Artikelen gereconstrueerd uit items[].bronnen (feedtitel \`ft\` indien aanwezig, anders URL-slug; beschrijving \`fd\`), clusterstap + bronnenlijst + sportdubbel. Zonder netwerk en zonder AI.\n\n**Beperking:** data.json bevat geen feedtitels (alleen URL-slugs, zonder hoofdletters) en de items zijn al samengevoegd; de reconstructie is dus een benadering. De opgeslagen itemrubriek wordt gebruikt als feedcategorie, maar kan daarvan afwijken. De afstandsregel is op echte feedtitels getest in tests/cluster-443.test.ts; hier is vooral te zien dat de nieuwe logica niets extra splitst en dat clusterkeys/-hashes gelijk blijven.\n`;
for (const f of BESTANDEN) {
  md += `\n## ${f}\n\n`;
  if (!existsSync(f)) { md += "Bestand ontbreekt, overgeslagen.\n"; continue; }
  const d = JSON.parse(readFileSync(f, "utf8"));
  const items = d.items || [];
  const mk = () => items.flatMap((it, n) => (it.bronnen || []).map((b, j) => ({ cat: it.cat, site: b.site, href: b.href, t: b.ft || slug(b.href), s: b.fd || "", d: (it.t || 0) - n * 1000 + j, item: n })));
  const ck = (m) => m.cluster(mk());
  const co = ck(oud), cn = ck(nieuw);
  const so = new Map(co.map((k) => [sig(k), k])), sn = new Map(cn.map((k) => [sig(k), k]));
  const tel = (cs) => { const r = {}; for (const k of cs) r[k.cat] = (r[k.cat] || 0) + 1; return r; };
  const to = tel(co), tn = tel(cn), cats = [...new Set([...Object.keys(to), ...Object.keys(tn)])].sort();
  md += `Items in bestand: ${items.length}, artikelen gereconstrueerd: ${mk().length}\n\n| cat | clusters oud | clusters nieuw |\n|---|---|---|\n`;
  for (const c of cats) md += `| ${c} | ${to[c] || 0} | ${tn[c] || 0} |\n`;
  md += `| **totaal** | ${co.length} | ${cn.length} |\n\n`;
  const alleenOud = [...so.keys()].filter((s) => !sn.has(s)), alleenNieuw = [...sn.keys()].filter((s) => !so.has(s));
  md += `Clusters met identieke ledenset (zelfde clusterkey, zelfde clusterhash voor dezelfde kop): ${co.length - alleenOud.length} van ${co.length}. Gewijzigde clusters: ${alleenOud.length} oud → ${alleenNieuw.length} nieuw. Hooguit dit aantal clusterhashes/samenvattingen verandert.\n\n`;
  const titel = (k) => k.c.map((c) => `${c.site}: ${c.t.slice(0, 70)}`).join("; ");
  for (const s of alleenOud) md += `- OUD (gesplitst/anders): ${titel(so.get(s))}\n`;
  for (const s of alleenNieuw) md += `- NIEUW: ${titel(sn.get(s))}\n`;
  // uitgeverlinks per item: oude bronnenlijst (exacte site) en daarna de oude sportdubbel-samenvoeging
  const itemsBronnen = (m, cs) => cs.map((k) => ({ cat: k.cat, kop: items[k.c[0].item]?.kop, t: items[k.c[0].item]?.t, bronnen: nBron(m, k).map((c) => ({ site: c.site, href: c.href })) }));
  const sdo = oud.ontdubbelSport(itemsBronnen(oud, co)), sdn = nieuw.ontdubbelSport(itemsBronnen(nieuw, cn));
  const dubItems = (its) => its.filter((i) => { const u = i.bronnen.map((b) => oud.uitgever(b.site)); return new Set(u).size < u.length; });
  const uitgeverDubbel = (its) => its.reduce((n, i) => n + i.bronnen.length - new Set(i.bronnen.map((b) => oud.uitgever(b.site))).size, 0);
  md += `\nItems na sportdubbel: oud ${sdo.items.length}, nieuw ${sdn.items.length} (samengevoegd ${sdo.samengevoegd} / ${sdn.samengevoegd}).\n`;
  md += `Dubbele uitgeverlinks in de bronnenlijsten: oud ${uitgeverDubbel(sdo.items)} (in ${dubItems(sdo.items).length} items), nieuw ${uitgeverDubbel(sdn.items)} (in ${dubItems(sdn.items).length} items); verdwenen: ${uitgeverDubbel(sdo.items) - uitgeverDubbel(sdn.items)}.\n`;
  md += `Dubbele uitgeverlinks in de bestaande data (zoals gepubliceerd): ${uitgeverDubbel(items.map((i) => ({ bronnen: i.bronnen || [] })))} in ${dubItems(items.map((i) => ({ bronnen: i.bronnen || [] }))).length} items.\n`;
  // clusterhash: kop van het item waaruit het cluster is gereconstrueerd
  const splits = alleenNieuw.length > alleenOud.length ? alleenNieuw.length - alleenOud.length : 0;
  md += `Netto extra clusters door de afstandsregel: ${cn.length - co.length}${splits ? ` (alle ${splits} extra splitsingen staan hierboven; zonder reden gesplitst: controleer die regels)` : ""}.\n`;
}
writeFileSync(RAPPORT, md);
console.log(md);
