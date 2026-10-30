// X (Twitter) zonder login of API-sleutel. Elk uur, gratis:
//  1. api.fxtwitter.com/2/profile/<naam>/statuses  (FxEmbed, open JSON-API; laatste ±20 posts, met MP4-varianten)
//  2. terugval: syndication.twitter.com timeline-profile (de officiële embed-tijdlijn, __NEXT_DATA__)
// Reposts van anderen slaan we over: alleen wat het account zelf post.
import type { Entry } from "./parse";
import { kortGetal, type Video } from "./videos";

export const xUser = (u: string) => /^https?:\/\/(?:www\.)?(?:x|twitter)\.com\/(?!i\/|home|search)([A-Za-z0-9_]{1,15})\/?$/.exec(u)?.[1] || null;
// Nieuwsaccounts die (soms) video posten. Hun artikelen komen al via RSS binnen: hier alleen de filmpjes.
export const X_VIDEO: Record<string, string> = { RTLnieuws: "RTL Nieuws", telegraaf: "De Telegraaf", ADnl: "AD", PowNed: "PowNed", GeenStijl: "GeenStijl", nhnieuws: "NH Nieuws", BNR: "BNR" };

export type XPost = { id: string; user: string; text: string; t: number; img?: string; mp4?: string; mp4Laag?: string; thumb?: string; dur?: number; views?: number; likes?: number };
const BR_UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";

function fromFx(s: any, user: string): XPost | null {
  if (!s || String(s.author?.screen_name || "").toLowerCase() !== user.toLowerCase()) return null; // repost van een ander
  const m = s.media || {};
  const v = (m.videos || [])[0];
  const mp4s = ((v?.formats || []) as any[]).filter((f) => f.container === "mp4" && f.url).sort((a, b) => (a.bitrate || 0) - (b.bitrate || 0));
  const speel = mp4s.find((f) => (f.bitrate || 0) >= 800000) || mp4s[mp4s.length - 1];
  return {
    id: String(s.id), user, text: String(s.text || "").trim(), t: (+s.created_timestamp || Date.parse(s.created_at) / 1000) * 1000,
    img: m.photos?.[0]?.url || undefined,
    mp4: speel?.url || (v?.url && /\.mp4/.test(v.url) ? v.url : undefined), mp4Laag: mp4s[0]?.url, thumb: v?.thumbnail_url, dur: v?.duration,
    views: s.views ?? undefined, likes: s.likes ?? undefined,
  };
}
export async function xFx(user: string): Promise<XPost[]> {
  const r = await fetch(`https://api.fxtwitter.com/2/profile/${user}/statuses`, { headers: { "User-Agent": "nieuwsinkort/1.0 (+https://nieuwsinkort.pages.dev)" }, signal: AbortSignal.timeout(12000) });
  if (!r.ok) throw new Error(`fxtwitter HTTP ${r.status}`);
  const j: any = await r.json();
  if (j?.code !== 200) throw new Error(`fxtwitter ${j?.code || "?"}`);
  return ((j.results || []) as any[]).map((s) => fromFx(s, user)).filter(Boolean) as XPost[];
}
export async function xSyndication(user: string): Promise<XPost[]> {
  const r = await fetch(`https://syndication.twitter.com/srv/timeline-profile/screen-name/${user}`, { headers: { "User-Agent": BR_UA, Accept: "text/html" }, signal: AbortSignal.timeout(12000) });
  if (!r.ok) throw new Error(`syndication HTTP ${r.status}`);
  const h = await r.text();
  const m = /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/.exec(h);
  if (!m) throw new Error("syndication: geen data");
  const es: any[] = JSON.parse(m[1])?.props?.pageProps?.timeline?.entries || [];
  const out: XPost[] = [];
  for (const e of es) {
    const t = e?.content?.tweet;
    if (!t || String(t.user?.screen_name || "").toLowerCase() !== user.toLowerCase() || t.retweeted_status) continue;
    const md = (t.extended_entities?.media || t.entities?.media || [])[0];
    const vs = ((md?.video_info?.variants || []) as any[]).filter((v) => v.content_type === "video/mp4").sort((a, b) => (a.bitrate || 0) - (b.bitrate || 0));
    let text = String(t.full_text || t.text || "");
    for (const u of t.entities?.urls || []) text = text.replace(u.url, u.expanded_url || u.url);
    text = text.replace(/\s*https:\/\/t\.co\/\w+\s*$/, "").trim();
    out.push({
      id: t.id_str, user, text, t: Date.parse(t.created_at),
      img: md?.type === "photo" ? md.media_url_https : undefined,
      mp4: (vs.find((v) => (v.bitrate || 0) >= 800000) || vs[vs.length - 1])?.url, mp4Laag: vs[0]?.url, thumb: md?.type !== "photo" ? md?.media_url_https : undefined,
      dur: md?.video_info?.duration_millis ? md.video_info.duration_millis / 1000 : undefined, likes: t.favorite_count,
    });
  }
  return out.sort((a, b) => b.t - a.t);
}
/** Eerst fxtwitter, dan syndication. Geeft ook terug welke route werkte en wat er misging. */
export async function xPosts(user: string): Promise<{ posts: XPost[]; via: string; err?: string }> {
  const errs: string[] = [];
  for (const [via, fn] of [["fxtwitter", xFx], ["syndication", xSyndication]] as const) {
    try { return { posts: await fn(user), via, ...(errs.length ? { err: errs.join("; ") } : {}) }; }
    catch (e: any) { errs.push(String(e?.message || e).slice(0, 60)); }
  }
  throw new Error(errs.join("; "));
}
const schoon = (s: string) => s.replace(/https?:\/\/\S+/g, "").replace(/\s+/g, " ").trim();
export function xEntry(p: XPost): Entry {
  const txt = schoon(p.text);
  return { t: (txt.split(/(?<=[.!?])\s/)[0] || `Post van @${p.user}`).slice(0, 160), l: `https://x.com/${p.user}/status/${p.id}`, d: p.t, s: txt.slice(0, 600), img: p.img || p.thumb };
}
export function xVideo(p: XPost, naam: string, hhmm: (t: number) => string): Video {
  const tekst = schoon(p.text);
  let titel = (tekst.match(/^[\s\S]{15,140}?[.!?](\s|$)/)?.[0] || tekst).trim() || `Video van ${naam}`;
  if (titel.length > 110) titel = titel.slice(0, 107).replace(/\s+\S*$/, "") + "…";
  const rest = tekst.slice(titel.length).trim();
  return {
    titel, ai: rest.length > 140 ? rest.slice(0, 137).replace(/\s+\S*$/, "") + "…" : rest, bron: "X",
    href: `https://x.com/${p.user}/status/${p.id}`, embed: p.mp4, thumb: p.thumb || "",
    populariteit: p.views ? kortGetal(p.views, "views") : p.likes ? kortGetal(p.likes, "likes") : "",
    tijd: hhmm(p.t), _score: (p.views || 0) + (p.likes || 0) * 20, _pub: p.t, soort: (p.dur || 0) > 240 ? "journaal" : "short", ...({ _k: naam } as any),
  };
}
