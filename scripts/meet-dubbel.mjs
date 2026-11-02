// Meet dubbele inhoud in artikelen (#488): node scripts/meet-dubbel.mjs [--max-fetch 60] [--cache /tmp/meer-cache] [--host https://nieuwsinkort.pages.dev] data.json [data2.json …]
// Schrijft markdown naar stdout. Alleen lezen: per item met `meer` één GET /meer?k=… (gecachet in --cache, rustig, hooguit --max-fetch echte verzoeken in totaal).
// Overlapmaat: src/dubbel.ts `dekking` = deel van de inhoudswoorden (zonder lidwoorden/hulpwoorden, lichte stam, getallen heel) dat al in de bekende tekst staat.
//   (1) punt "al in de tekst":    dekking(punt, intro+samenvatting) ≥ 0,75
//   (2) lijst met < 2 nieuwe punten: nieuwePunten() is leeg terwijl er punten zijn (dit verbergt de hele lijst)
//   (3) Uitgebreid = herhaling:   de Uitgebreid-bron (AI-uitleg → bronalinea's → terugval samenvatting+ai+punten) heeft < 2 zinnen met dekking < 0,75 t.o.v. intro+samenvatting+punten
//   (4) samenvatting herhaalt intro: dekking(samenvatting, intro) ≥ 0,6 ("grotendeels")
// "na" = wat de client nu doet (uitgebreidOntdubbeld/nieuwePunten): verborgen, ingekort (sectie blijft maar zinnen vallen weg) of ongewijzigd.
import { build } from "esbuild";
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

const a = process.argv.slice(2), opt = (n, d) => { const i = a.indexOf(n); if (i < 0) return d; const [, v] = a.splice(i, 2); return v; };
const maxFetch = Number(opt("--max-fetch", 60)), cache = opt("--cache", "/tmp/meer-cache"), host = opt("--host", "https://nieuwsinkort.pages.dev");
const bestanden = a;
if (!bestanden.length) { console.error("gebruik: node scripts/meet-dubbel.mjs [opties] data.json …"); process.exit(1); }
mkdirSync(cache, { recursive: true });

async function laad(entry) {
  const r = await build({ entryPoints: [entry], bundle: true, write: false, format: "esm", platform: "node", logLevel: "silent" });
  return import("data:text/javascript;base64," + Buffer.from(r.outputFiles[0].text).toString("base64"));
}
const D = await laad("src/dubbel.ts"), U = await laad("src/uitgebreid.ts");

let gehaald = 0;
async function meerVan(k) {
  const f = join(cache, createHash("sha1").update(k).digest("hex") + ".json");
  if (existsSync(f)) return JSON.parse(readFileSync(f, "utf8"));
  if (gehaald >= maxFetch) return undefined;
  gehaald++;
  await new Promise((r) => setTimeout(r, 400));
  let m = null;
  try { const r = await fetch(`${host}/meer?k=${encodeURIComponent(k)}`, { headers: { "user-agent": "nieuwsinkort-meting/1.0" } }); m = r.ok ? await r.json() : null; } catch { m = null; }
  writeFileSync(f, JSON.stringify(m));
  return m;
}

const schoon = (l) => (l ?? []).map((p) => p.trim()).filter(Boolean);
const uit = [`# Dubbele inhoud in artikelen (#488), meting ${new Date().toISOString().slice(0, 16)}Z`, "", "Maat en drempels: zie kop van scripts/meet-dubbel.mjs (dekking in inhoudswoorden; punt/zin telt als herhaling bij ≥ 0,75; samenvatting↔intro bij ≥ 0,6).", ""];
const voorbeelden = [];
for (const f of bestanden) {
  const items = JSON.parse(readFileSync(f, "utf8")).items ?? [];
  const t = { n: items.length, metPunten: 0, t1: 0, t2: 0, t2een: 0, meerKey: 0, meerOk: 0, t3uit: 0, t3terugval: 0, t4: 0,
    naPuntenVerborgen: 0, naUitVerborgen: 0, naUitIngekort: 0, naUitOngewijzigd: 0, naOngewijzigd: 0 };
  for (const it of items) {
    const bekend = `${it.ai || ""}\n${it.samenvatting || ""}`;
    const punten = it.punten ?? [];
    const dubbelPunt = punten.some((p) => D.dekking(p, bekend) >= D.DREMPEL_PUNT);
    let puntenVerborgen = false;
    if (punten.length) {
      t.metPunten++;
      if (dubbelPunt) t.t1++;
      if (!D.nieuwePunten(punten, it.ai, it.samenvatting).length) { t.t2++; puntenVerborgen = true; if (punten.length === 1) t.t2een++; }
    }
    const t4 = !!(it.samenvatting && it.ai) && D.dekking(it.samenvatting, it.ai) >= 0.6;
    if (t4) t.t4++;
    // Uitgebreid
    let meer = null, bron = "terugval";
    if (it.meer) {
      t.meerKey++;
      meer = await meerVan(it.meer);
      if (meer) { t.meerOk++; bron = schoon(meer.uitleg).length ? "uitleg" : schoon(meer.uittreksel?.flatMap((b) => b.alineas ?? [])).length ? "bron" : "terugval"; }
    }
    const o = U.uitgebreidOntdubbeld(it, meer);
    const voorAlineas = bron === "uitleg" ? schoon(meer.uitleg) : bron === "bron" ? schoon(meer.uittreksel.flatMap((b) => b.alineas ?? [])) : U.uitgebreidAlineas(it, meer);
    const bekendUit = [it.ai || "", ...schoon([it.samenvatting]).flatMap((s) => s.split(/\n\s*\n/)), ...D.nieuwePunten(punten, it.ai, it.samenvatting)];
    const herhaling = bron === "terugval" || !D.nieuweAlineas(voorAlineas, bekendUit).length;
    let uitStatus = "ongewijzigd";
    const nietGemeten = !!it.meer && meer === undefined; // buiten de fetch-limiet: niet meegeteld bij (3) en "na"
    if (!nietGemeten) {
      if (bron === "terugval") t.t3terugval++;
      if (herhaling) t.t3uit++;
      if (!o.uitgebreid.length) { t.naUitVerborgen++; uitStatus = "verborgen"; }
      else if (o.uitgebreid.join(" ").length < voorAlineas.join(" ").length - 5) { t.naUitIngekort++; uitStatus = "ingekort"; }
      else t.naUitOngewijzigd++;
    }
    if (puntenVerborgen) t.naPuntenVerborgen++;
    if (!puntenVerborgen && uitStatus === "ongewijzigd") t.naOngewijzigd++;
    if (/Delhaize|Carrefour|iPad mini|MacBook-adapters/.test(it.kop) && voorbeelden.length < 8 && f === bestanden[0])
      voorbeelden.push({ kop: it.kop, ai: it.ai, samenvatting: it.samenvatting, punten, bron, uitStatus, puntenVerborgen, nieuwePunten: D.nieuwePunten(punten, it.ai, it.samenvatting), uitgebreid: o.uitgebreid });
  }
  uit.push(`## ${f}`, "", `Items: ${t.n}; met punten: ${t.metPunten}; met \`meer\`: ${t.meerKey} (opgehaald ${t.meerOk}; zonder tekst (verlopen of niet in KV) of buiten de limiet ${t.meerKey - t.meerOk}; die buiten de limiet staan niet in (3) en na).`, "",
    "| type | aantal |", "|---|---|",
    `| (1) punt staat al (grotendeels) in intro/samenvatting | ${t.t1} |`,
    `| (2) puntenlijst met < 2 nieuwe punten (daarvan lijst van 1 punt) | ${t.t2} (${t.t2een}) |`,
    `| (3) Uitgebreid = herhaling (totaal) | ${t.t3uit} |`,
    `| (3a) daarvan: terugval samenvatting+ai+punten (geen \`meer\`-tekst) | ${t.t3terugval} |`,
    `| (4) samenvatting herhaalt intro grotendeels | ${t.t4} |`, "",
    `Na (client, src/dubbel.ts): puntenlijsten verborgen ${t.naPuntenVerborgen}; Uitgebreid verborgen ${t.naUitVerborgen}, ingekort ${t.naUitIngekort}, ongewijzigd ${t.naUitOngewijzigd}; artikelen volledig ongewijzigd (punten én Uitgebreid) ${t.naOngewijzigd}.`, "");
}
uit.push(`Echte GET-verzoeken naar ${host}/meer deze run: ${gehaald} (limiet ${maxFetch}; rest uit ${cache}).`, "");
if (voorbeelden.length) { uit.push("## Voorbeelden (eerste bestand)", ""); for (const v of voorbeelden) uit.push("```json", JSON.stringify(v, null, 1), "```", ""); }
console.log(uit.join("\n"));
