// Foto's bij de berichten van de routine (public/data.json): per bericht de foto's uit alle bronnen.
//  1. og:image van elk bron-artikel (max 4 per bericht), gecachet 3 dagen in scripts/.cache/og.json
//  2. zelfde regels als site/Worker (src/beeld.ts): geen logo's/placeholders/kleine plaatjes, zelfde foto in andere maat = dubbel
//  3. perceptuele hash (dHash, scripts/dhash.py): bijna-gelijke foto's (zelfde persfoto bij twee sites) weg, en echt kleine plaatjes weg
// Gebruik: node scripts/add-beelden.mts [public/data.json]   (draait ook automatisch aan het eind van export_from_canvas.mjs)
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { uniekeBeelden, ogImage } from "../src/beeld.ts";
import { parseFeed } from "../worker/src/parse.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const file = process.argv[2] || path.join(here, "..", "public", "data.json");
const cacheDir = path.join(here, ".cache");
fs.mkdirSync(cacheDir, { recursive: true });
const ogFile = path.join(cacheDir, "og.json"), hFile = path.join(cacheDir, "dhash.json");
const load = (f: string) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return {}; } };
const og: Record<string, { u: string; t: number }> = load(ogFile);
const hs: Record<string, { v: any; t: number }> = load(hFile);
const UA = "nieuwsinkort/1.0 (+https://nieuwsinkort.pages.dev)";
const now = Date.now(), TTL = 3 * 864e5;
const SOCIAL = /instagram\.com|youtube\.com|youtu\.be|reddit\.com|x\.com|twitter\.com|tiktok\.com/;

async function ogOf(href: string): Promise<string> {
  const c = og[href];
  if (c && now - c.t < TTL) return c.u;
  let u = "";
  try {
    const r = await fetch(href, { headers: { "User-Agent": UA, Accept: "text/html" }, signal: AbortSignal.timeout(8000), redirect: "follow" });
    if (r.ok && r.body) {
      const rd = r.body.getReader(), dec = new TextDecoder();
      let html = "";
      while (html.length < 250000) { const { done, value } = await rd.read(); if (done) break; html += dec.decode(value, { stream: true }); if (/<\/head>/i.test(html)) break; }
      rd.cancel().catch(() => {});
      u = ogImage(html, r.url || href);
    }
    og[href] = { u, t: now };
  } catch { /* niet cachen: volgende keer opnieuw */ }
  return u;
}
async function pool<T, R>(xs: T[], n: number, f: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(xs.length); let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < xs.length) { const k = i++; out[k] = await f(xs[k]); } }));
  return out;
}
const ham = (a: string, b: string) => { let x = BigInt("0x" + a) ^ BigInt("0x" + b), n = 0; while (x) { n += Number(x & 1n); x >>= 1n; } return n; };

// 0. foto's uit de RSS/Atom-feeds zelf (enclosure / media:content / media:thumbnail), per artikel-link
const normLink = (l: string) => l.replace(/^https?:\/\/(www\.)?/, "").replace(/[?#].*$/, "").replace(/\/$/, "").toLowerCase();
const feedImg = new Map<string, string>();
const FEEDS = process.env.FEEDS_JSON || "/workspace/nieuws/feeds.json";
let feedsOk = 0, feedsFout: string[] = [];
if (fs.existsSync(FEEDS)) {
  const feeds = JSON.parse(fs.readFileSync(FEEDS, "utf8")).filter((f: any) => f.werkt && ["nl", "tech", "haarlem", "showbizz", "politiek"].includes(f.cat) && !/^https?:\/\/(x|twitter)\.com|reddit\.com|kg\.meowing\.de/.test(f.url));
  await pool(feeds, 8, async (f: any) => {
    try {
      const r = await fetch(f.url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(12000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      for (const e of parseFeed(await r.text(), f.url)) if (e.img && e.l) feedImg.set(normLink(e.l), e.img);
      feedsOk++;
    } catch (e) { feedsFout.push(`${f.naam}: ${String((e as any)?.message || e).slice(0, 40)}`); }
  });
}

const D = JSON.parse(fs.readFileSync(file, "utf8"));
const items: any[] = Array.isArray(D.items) ? D.items : [];
const fails: string[] = [];
const per: string[][] = await pool(items, 6, async (it) => {
  const all = (it.bronnen || []).map((b: any) => b.href).filter(Boolean);
  const fromFeed = all.map((h: string) => feedImg.get(normLink(h)));
  // og:image alleen voor bronnen zonder feed-foto
  const links = all.filter((h: string, k: number) => !fromFeed[k] && !SOCIAL.test(h)).slice(0, 4);
  const ogs = await Promise.all(links.map(ogOf));
  links.forEach((l: string, k: number) => { if (!ogs[k]) fails.push(l); });
  return uniekeBeelden([...(it.beelden || []), it.beeld, ...all.flatMap((h: string, k: number) => [fromFeed[k], ogs[links.indexOf(h)]])], 8);
});
// perceptuele hash (alleen nieuwe URL's)
const need = [...new Set(per.flat())].filter((u) => !hs[u] || now - hs[u].t > TTL);
if (need.length) {
  try {
    const r = JSON.parse(execFileSync("python3", [path.join(here, "dhash.py")], { input: JSON.stringify(need), maxBuffer: 1 << 26, timeout: 180000 }).toString());
    for (const u of need) hs[u] = { v: r[u] ?? null, t: now };
  } catch (e) { console.warn("add-beelden: dHash lukt niet, alleen URL-ontdubbeling:", String(e).slice(0, 120)); }
}
let n = 0, weg = 0, bijna = 0;
items.forEach((it, k) => {
  const keep: { u: string; h?: string }[] = [];
  for (const u of per[k]) {
    const v = hs[u]?.v;
    if (hs[u] && v === null) { weg++; continue; } // laadt niet
    if (v && (v.w < 300 || v.hgt < 160 || v.w / v.hgt > 4)) { weg++; continue; } // klein/banner
    if (v?.h && keep.some((x) => x.h && ham(x.h, v.h) <= 6)) { bijna++; continue; } // bijna dezelfde foto
    keep.push({ u, h: v?.h });
  }
  delete it.beeld;
  if (keep.length) { it.beelden = keep.slice(0, 6).map((x) => x.u); n++; } else delete it.beelden;
});
fs.writeFileSync(file, JSON.stringify(D, null, 1) + "\n");
fs.writeFileSync(ogFile, JSON.stringify(og));
fs.writeFileSync(hFile, JSON.stringify(hs));
console.log(`add-beelden: feeds ${feedsOk} gelezen (${feedImg.size} artikel-foto's), ${feedsFout.length} feeds mislukt`);
if (feedsFout.length) console.log("  feeds mislukt:", feedsFout.join("; "));
console.log(`add-beelden: ${n}/${items.length} berichten met foto; ${weg} kapot/klein weg, ${bijna} bijna-dubbel weg; og:image mislukt bij ${fails.length} links`);
if (fails.length) console.log("  geen og:image:", [...new Set(fails.map((l) => { try { return new URL(l).hostname; } catch { return l; } }))].join(", "));
