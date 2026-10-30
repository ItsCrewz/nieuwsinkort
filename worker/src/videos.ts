// Port van /workspace/nieuws/filmpjes.py (Dumpert-toppers, YouTube-nieuwskanalen, Reddit-video's).
import { decode, stripHtml } from "./parse";

export const YT_NIEUWS: Record<string, string> = {
  NOS: "UC5xziMuoFAOpX9mwUVhe2Jw", "RTL Nieuws": "UCv4NUJ5BGSpJz_leIfayDzQ", "NU.nl": "UCCw1aOc9x3sEjrUzT-qmMGw",
  "Hart van Nederland": "UCgOkhebo_ZU8rawIXsbyPXQ", "NH Nieuws": "UCSpctzQgGRJV84At2dV73qg", PowNews: "UCHTtspK-G7Wt68awRpTSkiw",
  WNL: "UCUSrVHoJrz68z3Q5qHZZC4w", EenVandaag: "UCjxk-pBIdYXjBQGie4uJGoA", "RTL Z": "UC3lleI2WsaIiW8IzkJ0kIYA", BNR: "UCWALr0VavEm8SgPXGafhFDQ",
  "NOS Stories": "UCoakeH4bmdUYtptWdmoUrRQ", Nieuwsuur: "UCExcZNwh_3Mwm4fF4VSiu2w", "Omroep PowNed": "UCihqgpWn_ns1gJUdhNLsSMQ", Radar: "UCGUhzuD1eYIgJoSGe0c_rNg",
};
export const ytUrl = (cid: string) => `https://www.youtube.com/feeds/videos.xml?channel_id=${cid}`;
export const REDDIT_SUBS = ["thenetherlands", "Netherlands", "worldnews", "europe", "Haarlem"];
export const redditUrl = (s: string) => `https://www.reddit.com/r/${s}/top/.rss?t=day`;
export const DUMPERT_URL = "https://www.dumpert.nl/toppers";

export type Video = { titel: string; ai: string; bron: string; href: string; embed?: string; thumb: string; populariteit: string; tijd: string; _score?: number; _pub?: number; soort?: Soort };

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

export { parseRedditVideos } from "./reddit";

// ---------------------------------------------------------------- Shorts vs. Journaals
/** "journaal" = uitzending/reportage (liggend, langer); "short" = kort clipje (YouTube Shorts, Reels, Reddit, X). */
export type Soort = "short" | "journaal";
const JOURNAAL_RE = /journaal|nieuwsuitzending|\buitzending\b|bulletin|nieuwsoverzicht|het nieuws van|nieuws van (de dag|vandaag)|\b(nos|rtl) nieuws (om )?\d{1,2}[:.]\d{2}|\b(8|20|18|19)[:.]00 ?uur/i;
export function soortVan(v: { titel?: string; href?: string; embed?: string; bron?: string; soort?: string }): Soort {
  if (v.soort === "short" || v.soort === "journaal") return v.soort;
  if (JOURNAAL_RE.test(v.titel || "")) return "journaal";
  const u = `${v.href || ""} ${v.embed || ""}`;
  if (/youtube\.com\/shorts\//i.test(u)) return "short";
  if (/youtube(?:-nocookie)?\.com\/(?:watch|embed|live)|youtu\.be\//i.test(u) && !/dumpert/i.test(v.bron || "")) return "journaal";
  return "short";
}

// ---------------------------------------------------------------- Instagram (zonder login)
// Kittygram blokkeert Cloudflare-IP's (HTTP 500 "Blocked"). Instagram's eigen profiel-embed
// (instagram.com/<naam>/embed/) is openbaar en geeft de laatste 6 posts met echte tijd, tekst en of het een video is.
export const igUser = (url: string) => /kg\.meowing\.de\/([^/]+)\/atom\.xml|instagram\.com\/([\w.]+)\/?(?:embed\/?)?$/i.exec(url)?.slice(1).find(Boolean) || "";
export const igProfileUrl = (user: string) => `https://www.instagram.com/${user}/embed/`;
export const igPostEmbed = (code: string) => `https://www.instagram.com/p/${code}/embed/captioned/`;
export type IgPost = { code: string; video: boolean; t: number; text: string; img: string; likes: number; user: string };
export function parseIgProfile(html: string): IgPost[] {
  const m = /"contextJSON":"((?:[^"\\]|\\.)*)"/.exec(html);
  if (!m) throw new Error("geen Instagram-embeddata");
  const ctx = JSON.parse(JSON.parse(`"${m[1]}"`)).context || {};
  return (ctx.graphql_media || []).map((g: any) => g.shortcode_media).filter(Boolean).map((s: any) => ({
    code: s.shortcode, video: !!s.is_video, t: (s.taken_at_timestamp || 0) * 1000,
    text: String(s.edge_media_to_caption?.edges?.[0]?.node?.text || "").trim(),
    img: s.display_resources?.[0]?.src || s.display_url || "", likes: s.edge_liked_by?.count || 0, user: s.owner?.username || ctx.username || "",
  }));
}
/** MP4-adres uit de post-embed (openbaar, ondertekend, enkele dagen geldig; CORS/CORP staan open). */
export function igVideoUrl(html: string): string {
  const m = /video_url(?:\\+)?":(?:\\+)?"(https:[^"]+?\.mp4[^"]*?)(?:\\+)?"/.exec(html);
  if (!m) return "";
  return m[1].replace(/\\+\//g, "/").replace(/\\+u0026/g, "&").replace(/\\+/g, "");
}
const eersteZin = (s: string) => (s.match(/^[\s\S]{15,140}?[.!?](\s|$)/)?.[0] || s.split("\n")[0]).replace(/\s+/g, " ").trim();
export function igVideo(p: IgPost, mp4: string, naam: string, hhmm: (t: number) => string): Video {
  const tekst = p.text.replace(/(\s*#[\p{L}\d_]+)+\s*$/u, "").trim();
  let titel = eersteZin(tekst) || `Video van ${naam}`;
  if (titel.length > 110) titel = titel.slice(0, 107).replace(/\s+\S*$/, "") + "…";
  const rest = tekst.slice(tekst.indexOf(titel) >= 0 ? titel.length : 0).replace(/\s+/g, " ").trim();
  return {
    titel, ai: rest.length > 140 ? rest.slice(0, 137).replace(/\s+\S*$/, "") + "…" : rest, bron: "Instagram",
    href: `https://www.instagram.com/reel/${p.code}/`, embed: mp4, thumb: p.img, populariteit: p.likes ? kortGetal(p.likes, "likes") : "",
    tijd: hhmm(p.t), _score: p.likes * 20, _pub: p.t, soort: "short", ...({ _k: naam } as any),
  };
}
