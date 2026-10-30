// Bouwt public/bronnen.json: de lijst met alle bronnen die de site gebruikt, per rubriek.
// Bron van waarheid: scripts/pipeline/feeds.json (+ scripts/pipeline/filmpjes.py).
// Draait automatisch vóór `npm run build`. Ontbreekt feeds.json (bijv. op een andere machine),
// dan blijft de bestaande public/bronnen.json staan.
//   FEEDS_JSON=<pad>     ander feeds-bestand
//   FILMPJES_PY=<pad>    ander filmpjes-script
import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(root, "public", "bronnen.json");
const FEEDS = process.env.FEEDS_JSON || join(root, "scripts/pipeline/feeds.json");
const FILMPJES = process.env.FILMPJES_PY || join(root, "scripts/pipeline/filmpjes.py");

const feedPath = existsSync(FEEDS) ? realpathSync(FEEDS) : resolve(FEEDS);
const rel = relative(realpathSync(root), feedPath);
if (rel === ".." || rel.startsWith("../") || isAbsolute(rel)) {
  console.warn("[bronnen] waarschuwing: FEEDS_JSON wijst buiten de repo; deze invoer staat mogelijk niet in review");
}

if (!existsSync(FEEDS)) {
  console.log(`[bronnen] ${FEEDS} niet gevonden; ${existsSync(OUT) ? "bestaande bronnen.json blijft staan" : "geen bronnen.json"}`);
  if (!existsSync(OUT)) writeFileSync(OUT, JSON.stringify({ groepen: [] }) + "\n");
  process.exit(0);
}

// Moet gelijk zijn aan norm() in src/sources.ts
export const norm = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/^de\s+/, "")
    .replace(/[^a-z0-9]+/g, "");

const GROUPS = [
  { id: "nl", label: "Nederland" },
  { id: "tech", label: "Tech & AI" },
  { id: "haarlem", label: "Haarlem" },
  { id: "showbizz", label: "Showbizz" },
  { id: "politiek", label: "Politiek" },
  { id: "voetbal", label: "Voetbal" },
  { id: "f1", label: "Formule 1" },
  { id: "auto", label: "Auto" },
  { id: "filmpjes", label: "Filmpjes" },
  { id: "dumpert", label: "Dumpert" },
];

// Rubriekloze 'social'-feeds koppelen aan een rubriek
function socialCat(f) {
  const u = (f.url || "").toLowerCase();
  if (/haarlem/.test(u)) return "haarlem";
  if (/technology|artificial|openai/.test(u)) return "tech";
  return "nl";
}

const OVERRIDES = [
  [/^Officiële bekendmakingen/i, "Officiële bekendmakingen"],
  [/^Gemeenteraad Haarlem/i, "Gemeenteraad Haarlem"],
  [/^Notubiz/i, "Gemeenteraad Haarlem"],
  [/^Burgernet/i, "Burgernet"],
  [/^Rodi\b/i, "Rodi"],
  [/^Politie X /i, "Politie Haarlem (X)"],
  [/^Politie\b/i, "Politie"],
  [/Volkskrant/i, "de Volkskrant"],
  [/^OpenAI/i, "OpenAI"],
  [/^Anthropic/i, "Anthropic"],
  [/^NH (RSS2|feed)$/i, "NH Nieuws"],
  [/^NOS Tech$/i, "NOS"],
];
const SUFFIX = /\s+(algemeen|buitenland|binnenland|economie|politiek|mixed|alt|advisories|entertainment|achterklap|muziek|film|media|show|cultuur( & media)?|top( day)?|new|kev|site( rss)?|rss2?|api)$/i;

function brand(f) {
  let n = String(f.naam || "").trim();
  for (const [re, v] of OVERRIDES) if (re.test(n)) return v;
  n = n.replace(/\s*\((youtube|kittygram|community|podcast|sru|ori\/notubiz)\)\s*/gi, " ").trim();
  let prev;
  do {
    prev = n;
    n = n.replace(SUFFIX, "").replace(/\s+nieuws$/, "").trim(); // alleen kleine letter: 'RTL Nieuws' blijft
  } while (n !== prev && n.includes(" "));
  return n || f.naam;
}

function soort(f) {
  const u = (f.url || "").toLowerCase();
  if (u.includes("youtube.com")) return "YouTube";
  if (u.includes("kg.meowing.de") || /instagram/i.test(f.naam)) return "Instagram";
  if (u.includes("reddit.com")) return "Reddit";
  if (/(^|\/\/)(www\.)?(x|twitter)\.com/.test(u)) return "X";
  if (/podcast/i.test(f.naam)) return "Podcast";
  return "";
}

const GENERIC_HOSTS = /^(youtube\.com|x\.com|twitter\.com|reddit\.com|feedburner\.com|kg\.meowing\.de|githubusercontent\.com|hnrss\.org|blog\.google|npo\.nl)$/;
function hostOf(url) {
  try {
    const h = new URL(url).hostname.replace(/^www\./, "");
    const parts = h.split(".");
    return parts.slice(-2).join(".");
  } catch {
    return "";
  }
}

const feeds = JSON.parse(readFileSync(FEEDS, "utf8")).filter((f) => f && f.werkt);
const groups = new Map(GROUPS.map((g) => [g.id, new Map()]));
for (const f of feeds) {
  const cat = f.cat === "social" ? socialCat(f) : f.cat;
  const g = groups.get(cat);
  if (!g) continue;
  const naam = brand(f);
  const id = norm(naam);
  const s = g.get(id) || { id, naam, alias: new Set(), hosts: new Set(), soort: new Set(), feeds: 0, urls: [] };
  s.feeds++;
  s.urls.push({ url: f.url, ...(f.ua ? { ua: f.ua } : {}), ...(f.max != null ? { max: f.max } : {}) });
  s.alias.add(norm(f.naam));
  s.alias.add(norm(naam.replace(/\s*\(X\)$/, "")));
  const xh = /x\.com\/([A-Za-z0-9_]+)/.exec(f.url || "");
  if (xh) s.alias.add(norm(`X (@${xh[1]})`));
  const h = hostOf(f.url);
  if (h && !GENERIC_HOSTS.test(h)) s.hosts.add(h);
  const so = soort(f);
  if (so) s.soort.add(so);
  g.set(id, s);
}

// Filmpjes/Dumpert uit filmpjes.py
if (existsSync(FILMPJES)) {
  const py = readFileSync(FILMPJES, "utf8");
  const bronnen = [...py.matchAll(/"bron":\s*"([^"]+)"/g)].map((m) => m[1]);
  const yt = /YT_NIEUWS\s*=\s*\{([\s\S]*?)\n\}/.exec(py);
  const kanalen = yt ? [...yt[1].matchAll(/"([^"]+)"\s*:/g)].map((m) => m[1]) : [];
  const subs = /REDDIT_SUBS\s*=\s*\[([^\]]*)\]/.exec(py);
  const subreddits = subs ? [...subs[1].matchAll(/"([^"]+)"/g)].map((m) => `r/${m[1]}`) : [];
  for (const b of new Set(bronnen)) {
    const cat = /dumpert/i.test(b) ? "dumpert" : "filmpjes";
    const id = norm(b);
    const info = b === "YouTube" && kanalen.length ? kanalen.join(", ") : b === "Reddit" && subreddits.length ? subreddits.join(", ") : b === "Dumpert" ? "Toppers van vandaag" : "";
    groups.get(cat).set(id, { id, naam: b, alias: new Set([id]), hosts: new Set(), soort: new Set(), feeds: 1, info });
  }  // X-video's: elk uur door de uur-Worker (fxtwitter/syndication), niet meer via de routine
  groups.get("filmpjes").set("x", { id: "x", naam: "X", alias: new Set(["x", "twitter"]), hosts: new Set(), soort: new Set(), feeds: 1, info: "Video's van RTL Nieuws, De Telegraaf, AD, PowNed, GeenStijl, NH Nieuws, BNR en de politieke accounts" });
}

const out = {
  gegenereerd: new Date().toISOString(),
  groepen: GROUPS.map((g) => ({
    id: g.id,
    label: g.label,
    bronnen: [...groups.get(g.id).values()]
      .map((s) => {
        const o = { id: s.id, naam: s.naam };
        const alias = [...s.alias].filter((a) => a && a !== s.id);
        if (alias.length) o.alias = alias;
        if (s.hosts.size) o.hosts = [...s.hosts];
        const info = s.info || [...s.soort].join(", ");
        if (info) o.info = info;
        // Voor de uur-pipeline: welke feeds bij deze bron horen (sleutel in data.bronstats = "<groep>|<id>")
        if (s.urls?.length) o.feeds = s.urls;
        return o;
      })
      .sort((a, b) => a.naam.localeCompare(b.naam, "nl", { sensitivity: "base" })),
  })),
};
// Een ongewijzigde lijst houdt haar datum, zodat builds reproduceerbaar blijven.
if (existsSync(OUT)) {
  const vorige = JSON.parse(readFileSync(OUT, "utf8"));
  if (JSON.stringify(vorige.groepen) === JSON.stringify(out.groepen)) out.gegenereerd = vorige.gegenereerd;
}
writeFileSync(OUT, JSON.stringify(out) + "\n");
console.log(`[bronnen] ${out.groepen.map((g) => `${g.id}:${g.bronnen.length}`).join(" ")} -> public/bronnen.json`);
