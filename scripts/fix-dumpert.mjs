#!/usr/bin/env node
// Zorgt dat elk Dumpert-item in data.json een afspeelbare `embed` heeft.
// - embed ontbreekt of is niet afspeelbaar -> haal de openbare itempagina (www.dumpert.nl/item/<id>)
//   op en kies dezelfde variant als filmpjes.py: MP4 > HLS (.m3u8) > YouTube-embed.
// - geen video te vinden (foto-item, verwijderd, pagina onbereikbaar) -> item uit de Dumpert-lijst.
// Gebruik: node scripts/fix-dumpert.mjs [data.json]   (standaard public/data.json)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const file = process.argv[2] || path.join(here, "..", "public", "data.json");
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const YT = /(?:youtube(?:-nocookie)?\.com\/(?:embed\/|shorts\/|watch\?(?:.*&)?v=)|youtu\.be\/)([\w-]{6,})/;
const isMp4 = (u) => /\.mp4(\?|$)/i.test(u || "");
const isHls = (u) => /\.m3u8(\?|$)/i.test(u || "");
const playable = (u) => isMp4(u) || isHls(u) || YT.test(u || "");

export function dumpertEmbed(it) {
  for (const md of it?.media || []) {
    const t = String(md.mediatype || "").toUpperCase();
    const vs = (md.variants || []).map((v) => [v.version || "", v.uri || ""]);
    for (const [, u] of vs) {
      const m = YT.exec(u);
      if (m) return `https://www.youtube-nocookie.com/embed/${m[1]}?autoplay=1&rel=0`;
    }
    if (t.includes("YOUTUBE")) {
      const id = vs.map(([, u]) => u).find((u) => /^[\w-]{11}$/.test(u));
      if (id) return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`;
    }
    if (t && t !== "VIDEO") continue;
    const d = Object.fromEntries(vs);
    for (const v of ["1080p", "720p", "tablet", "mobile", "original"]) if (isMp4(d[v])) return d[v];
    const anyMp4 = vs.find(([, u]) => isMp4(u));
    if (anyMp4) return anyMp4[1];
    if (isHls(d.stream)) return d.stream;
    for (const v of ["720p", "tablet", "1080p", "mobile"]) if (isHls(d[v])) return d[v];
  }
  return "";
}

async function fromItemPage(href) {
  const id = /dumpert\.nl\/item\/([\w-]+)/.exec(href || "")?.[1];
  if (!id) return { embed: "", reason: "geen item-id" };
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 15000);
  try {
    const r = await fetch(`https://www.dumpert.nl/item/${id}`, { headers: { "User-Agent": UA, "Accept-Language": "nl-NL,nl;q=0.9" }, signal: ctl.signal });
    if (!r.ok) return { embed: "", reason: `HTTP ${r.status}` };
    const h = await r.text();
    const m = /window\.__DUMPERT_CONTEXT__ = JSON\.parse\(\s*("(?:[^"\\]|\\.)*")\s*\)/s.exec(h);
    if (!m) return { embed: "", reason: "geen context op de pagina" };
    const st = JSON.parse(JSON.parse(m[1])).state || {};
    const key = Object.keys(st).find((k) => k.startsWith("getItemDetails"));
    const it = key && st[key]?.data?.result?.data?.items?.[0];
    if (!it) return { embed: "", reason: "item niet gevonden" };
    const embed = dumpertEmbed(it);
    const thumb = it.stills?.["still-medium"] || it.still || it.thumbnail || "";
    return { embed, thumb, reason: embed ? "" : `geen video (${(it.media || []).map((x) => x.mediatype).join("+") || "leeg"})` };
  } catch (e) {
    return { embed: "", reason: String(e?.message || e) };
  } finally {
    clearTimeout(t);
  }
}

async function main() {
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  const list = Array.isArray(data.dumpert) ? data.dumpert : [];
  const out = [];
  let fixed = 0;
  const dropped = [];
  for (const v of list) {
    if (playable(v.embed)) {
      out.push(v);
      continue;
    }
    const r = await fromItemPage(v.href);
    if (r.embed) {
      out.push({ ...v, embed: r.embed, thumb: v.thumb || r.thumb || "" });
      fixed++;
    } else dropped.push(`${v.titel} (${r.reason})`);
  }
  data.dumpert = out;
  if (fixed || dropped.length) fs.writeFileSync(file, JSON.stringify(data, null, 1) + "\n");
  console.log(`[dumpert] ${out.length} afspeelbaar, ${fixed} aangevuld, ${dropped.length} weggelaten${dropped.length ? ": " + dropped.join("; ") : ""}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    // Nooit de deploy blokkeren op dit script; de site filtert onspeelbare items zelf ook weg.
    console.error("[dumpert] overgeslagen:", e?.message || e);
  });
}
