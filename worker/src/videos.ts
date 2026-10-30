// Port van /workspace/nieuws/filmpjes.py (Dumpert-toppers, YouTube-nieuwskanalen).
import { decode, stripHtml } from "./parse";

export const YT_NIEUWS: Record<string, string> = {
  NOS: "UC5xziMuoFAOpX9mwUVhe2Jw", "RTL Nieuws": "UCv4NUJ5BGSpJz_leIfayDzQ", "NU.nl": "UCCw1aOc9x3sEjrUzT-qmMGw",
  "Hart van Nederland": "UCgOkhebo_ZU8rawIXsbyPXQ", "RTL Boulevard": "UC2Jbya_u-rQ0xBNHBYXvpTg", Shownieuws: "UCnZkUwDLBgLFEpXSeyEx3YA", "NH Nieuws": "UCSpctzQgGRJV84At2dV73qg", PowNews: "UCHTtspK-G7Wt68awRpTSkiw",
  WNL: "UCUSrVHoJrz68z3Q5qHZZC4w", EenVandaag: "UCjxk-pBIdYXjBQGie4uJGoA", "RTL Z": "UC3lleI2WsaIiW8IzkJ0kIYA", BNR: "UCWALr0VavEm8SgPXGafhFDQ",
  "NOS Stories": "UCoakeH4bmdUYtptWdmoUrRQ", Nieuwsuur: "UCExcZNwh_3Mwm4fF4VSiu2w", "Omroep PowNed": "UCihqgpWn_ns1gJUdhNLsSMQ", Radar: "UCGUhzuD1eYIgJoSGe0c_rNg",
  "NOS Sport": "UCT4oPufBQa0f6C67Fw_HXNg",
  "De Telegraaf": "UC1Et9K-hHf-P_LzQkE_Q3Jw",
  "GeenStijl": "UCE51aiJ30nQY14kFY021urg",
  "Ziggo Sport": "UCueOZEvMffxjJyVO1fGiJNQ",
  "ESPN NL": "UCXnPiEv1DoUCDAqDUXT9shQ",
  "OnsOranje": "UCpnmJcBhJqKIHFkKvgdkdMQ",
  "FORMULA 1": "UCB_qr75-ydFVKSF9Dmo6izg",
  "AutoWeek": "UCzToShYR6Sw_k1i6FsdEr6g",
  "Autovisie": "UCAkqAwuyz_qu3vfgAMQPCBw",
  "Haarlem105": "UCFDVl_p6fwkloGr8lraSZgQ",
};
export const ytUrl = (cid: string) => `https://www.youtube.com/feeds/videos.xml?channel_id=${cid}`;
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


// ---------------------------------------------------------------- Shorts vs. Journaals
/** "journaal" = uitzending/reportage (liggend, langer); "short" = kort clipje (YouTube Shorts, Reels, X). */
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

