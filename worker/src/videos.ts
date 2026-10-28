// Port van /workspace/nieuws/filmpjes.py (Dumpert-toppers, YouTube-nieuwskanalen, Reddit-video's).
import { decode, stripHtml } from "./parse";

export const YT_NIEUWS: Record<string, string> = {
  NOS: "UC5xziMuoFAOpX9mwUVhe2Jw", "RTL Nieuws": "UCv4NUJ5BGSpJz_leIfayDzQ", "NU.nl": "UCCw1aOc9x3sEjrUzT-qmMGw",
  "Hart van Nederland": "UCgOkhebo_ZU8rawIXsbyPXQ", "NH Nieuws": "UCSpctzQgGRJV84At2dV73qg", PowNews: "UCHTtspK-G7Wt68awRpTSkiw",
  WNL: "UCUSrVHoJrz68z3Q5qHZZC4w", EenVandaag: "UCjxk-pBIdYXjBQGie4uJGoA", "RTL Z": "UC3lleI2WsaIiW8IzkJ0kIYA", BNR: "UCWALr0VavEm8SgPXGafhFDQ",
};
export const ytUrl = (cid: string) => `https://www.youtube.com/feeds/videos.xml?channel_id=${cid}`;
export const REDDIT_SUBS = ["thenetherlands", "Netherlands", "worldnews", "europe", "Haarlem"];
export const redditUrl = (s: string) => `https://www.reddit.com/r/${s}/top/.rss?t=day`;
export const DUMPERT_URL = "https://www.dumpert.nl/toppers";
const VIDEO_RE = /v\.redd\.it|youtube\.com\/watch|youtu\.be\/|youtube\.com\/shorts|streamable\.com|(?:twitter|x)\.com\/[^/]+\/status|tiktok\.com|instagram\.com\/reel|nos\.nl\/video|rtl\.nl\/video/i;

export type Video = { titel: string; ai: string; bron: string; href: string; embed?: string; thumb: string; populariteit: string; tijd: string; _score?: number; _pub?: number };

export function kortGetal(n: number | undefined | null, eenheid: string) {
  if (n == null) return "";
  let s: string;
  if (n >= 1e6) s = (n / 1e6).toFixed(1).replace(".", ",").replace(",0", "") + "M";
  else if (n >= 1000) s = (n / 1000).toFixed(1).replace(".", ",").replace(",0", "") + "k";
  else s = String(n);
  return `${s} ${eenheid}`;
}
const YT = /(?:youtube(?:-nocookie)?\.com\/(?:embed\/|shorts\/|watch\?(?:.*&)?v=)|youtu\.be\/)([\w-]{6,})/;
const isMp4 = (u?: string) => /\.mp4(\?|$)/i.test(u || "");
const isHls = (u?: string) => /\.m3u8(\?|$)/i.test(u || "");
export function dumpertEmbed(it: any): string {
  for (const md of it?.media || []) {
    const t = String(md.mediatype || "").toUpperCase();
    const vs: [string, string][] = (md.variants || []).map((v: any) => [v.version || "", v.uri || ""]);
    for (const [, u] of vs) { const m = YT.exec(u); if (m) return `https://www.youtube-nocookie.com/embed/${m[1]}?autoplay=1&rel=0`; }
    if (t.includes("YOUTUBE")) { const id = vs.map(([, u]) => u).find((u) => /^[\w-]{11}$/.test(u)); if (id) return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`; }
    if (t && t !== "VIDEO") continue;
    const d = Object.fromEntries(vs);
    for (const v of ["1080p", "720p", "tablet", "mobile", "original"]) if (isMp4(d[v])) return d[v];
    const any = vs.find(([, u]) => isMp4(u)); if (any) return any[1];
    if (isHls(d.stream)) return d.stream;
    for (const v of ["720p", "tablet", "1080p", "mobile"]) if (isHls(d[v])) return d[v];
  }
  return "";
}

/** Alle bruikbare Dumpert-toppers (gepubliceerd na `since` ms), gesorteerd op kudos vandaag. */
export function parseDumpert(html: string, hhmm: (t: number) => string): (Video & { _pub: number })[] {
  const m = /window\.__DUMPERT_CONTEXT__ = JSON\.parse\(\s*("(?:[^"\\]|\\.)*")\s*\)/.exec(html);
  if (!m) throw new Error("geen __DUMPERT_CONTEXT__");
  const st = JSON.parse(JSON.parse(m[1])).state;
  const key = Object.keys(st).find((k) => k.includes("list=toppers"));
  if (!key) throw new Error("geen toppers-lijst");
  const out: (Video & { _pub: number })[] = [];
  for (const it of st[key].data.result.data.items) {
    if (it.nsfw || it.partner_content || it.secret) continue;
    const s = it.stats || {};
    if (!s.views_today) continue;
    const embed = dumpertEmbed(it);
    if (!embed) continue;
    const pub = Date.parse(it.published_at);
    out.push({
      titel: String(it.title).trim(), ai: stripHtml(it.description || ""), bron: "Dumpert", href: `https://www.dumpert.nl/item/${it.id}`, embed,
      thumb: it.stills?.["still-medium"] || it.still || it.thumbnail || "", populariteit: `${kortGetal(s.views_today, "views")} · ${s.kudos_today || 0} kudos`,
      tijd: hhmm(pub), _score: s.kudos_today || 0, _pub: pub,
    });
  }
  return out.sort((a, b) => (b._score || 0) - (a._score || 0));
}

export function parseYouTube(xml: string, kanaal: string, since: number, hhmm: (t: number) => string): Video[] {
  const out: Video[] = [];
  for (const e of xml.match(/<entry>[\s\S]*?<\/entry>/g) || []) {
    const pub = Date.parse(/<published>(.*?)<\/published>/.exec(e)?.[1] || "");
    if (!(pub >= since)) continue;
    const vid = /<yt:videoId>(.*?)<\/yt:videoId>/.exec(e)?.[1];
    if (!vid) continue;
    const views = /views="(\d+)"/.exec(e);
    const desc = /<media:description>([\s\S]*?)<\/media:description>/.exec(e);
    out.push({
      titel: decode(/<title>(.*?)<\/title>/.exec(e)?.[1] || "").trim(), ai: desc ? stripHtml(desc[1]).slice(0, 300) : "", bron: "YouTube",
      href: /<link rel="alternate" href="([^"]+)"/.exec(e)?.[1] || `https://www.youtube.com/watch?v=${vid}`,
      embed: `https://www.youtube-nocookie.com/embed/${vid}?autoplay=1&rel=0`, thumb: `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`,
      populariteit: views ? kortGetal(+views[1], "views") : "", tijd: hhmm(pub), _score: views ? +views[1] : 0, _pub: pub,
      ...({ _kanaal: kanaal } as any),
    });
  }
  return out;
}

export function parseRedditVideos(xml: string, sub: string, since: number, hhmm: (t: number) => string): Video[] {
  const out: Video[] = [];
  (xml.match(/<entry>[\s\S]*?<\/entry>/g) || []).forEach((e, rank) => {
    const pub = Date.parse(/<published>(.*?)<\/published>/.exec(e)?.[1] || "");
    if (!(pub >= since)) return;
    const c = decode(/<content[^>]*>([\s\S]*?)<\/content>/.exec(e)?.[1] || "");
    const vids = [...c.matchAll(/href="([^"]+)"/g)].map((m) => m[1]).filter((l) => VIDEO_RE.test(l));
    if (!vids.length) return;
    const vr = /v\.redd\.it\/([A-Za-z0-9]+)/.exec(vids[0]);
    const th = /<media:thumbnail url="([^"]+)"/.exec(e);
    out.push({
      titel: decode(/<title>(.*?)<\/title>/.exec(e)?.[1] || "").trim(), ai: "", bron: "Reddit", href: /<link href="([^"]+)"/.exec(e)?.[1] || "",
      embed: vr ? `https://v.redd.it/${vr[1]}/HLSPlaylist.m3u8` : "", thumb: th ? decode(th[1]) : "", populariteit: `#${rank + 1} top vandaag r/${sub}`,
      tijd: hhmm(pub), _score: Math.max(0, 50 - rank), _pub: pub,
    });
  });
  return out;
}
