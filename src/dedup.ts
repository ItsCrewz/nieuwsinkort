// Dubbele filmpjes eruit, over alle bronnen heen (YouTube, Instagram, X, Reddit, Dumpert, Politiek).
// Gedeeld door de site (src/), de Pages Function (functions/data.json.ts) en de uur-Worker (worker/).
// Twee filmpjes zijn hetzelfde als ze een sleutel delen: video-id (YouTube/Instagram/X/Reddit/Dumpert),
// hetzelfde mediabestand of dezelfde thumbnail (zonder query), dezelfde URL zonder tracking, of (bijna) dezelfde titel.
// Van elke groep blijft de beste kopie over (in de site afspeelbaar, beste kwaliteit, populairst);
// de andere bronnen komen in `ook`.

export type DVideo = { titel: string; href: string; embed?: string; thumb?: string; bron: string; ai?: string; tijd?: string; _pub?: number; populariteit?: string; ook?: { bron: string; href: string }[] };

const TRACK = /^(utm_\w+|si|igsh|igshid|feature|ref|ref_src|ref_url|s|fbclid|gclid|mc_\w+|share_id|context|pp)$/i;
export function canonUrl(u: string): string {
  try {
    const x = new URL(u);
    const host = x.hostname.replace(/^(www|m|mobile|old|new)\./, "").toLowerCase().replace(/^twitter\.com$/, "x.com");
    const keep: [string, string][] = [];
    x.searchParams.forEach((v, k) => keep.push([k, v]));
    const kept = keep.filter(([k]) => !TRACK.test(k)).sort(([a], [b]) => a.localeCompare(b));
    const q = kept.length ? "?" + kept.map(([k, v]) => `${k}=${v}`).join("&") : "";
    return `${host}${x.pathname.replace(/\/+$/, "")}${q}`;
  } catch {
    return u.trim().toLowerCase();
  }
}
const noQuery = (u: string) => u.replace(/^https?:\/\//, "").replace(/[?#].*$/, "").toLowerCase();

export function videoKeys(v: DVideo): string[] {
  const k = new Set<string>();
  for (const u of [v.href || "", v.embed || ""]) {
    if (!u) continue;
    let m = /(?:youtube(?:-nocookie)?\.com\/(?:embed\/|shorts\/|live\/|watch\?(?:.*&)?v=)|youtu\.be\/)([\w-]{11})/.exec(u);
    if (m) k.add(`yt:${m[1]}`);
    m = /instagram\.com\/(?:[\w.]+\/)?(?:p|reel|reels|tv)\/([\w-]{5,})/.exec(u);
    if (m) k.add(`ig:${m[1]}`);
    m = /(?:x|twitter)\.com\/[^/]+\/status(?:es)?\/(\d+)/.exec(u);
    if (m) k.add(`x:${m[1]}`);
    m = /reddit\.com\/r\/[\w-]+\/comments\/(\w+)/.exec(u);
    if (m) k.add(`rd:${m[1]}`);
    m = /v\.redd\.it\/(\w+)/.exec(u);
    if (m) k.add(`vr:${m[1]}`);
    m = /dumpert\.nl\/(?:item|mediabase)\/([\w_-]+)/.exec(u);
    if (m) k.add(`dp:${m[1].replace(/_/g, "-")}`);
    m = /amplify_video\/(\d+)|ext_tw_video\/(\d+)/.exec(u);
    if (m) k.add(`xv:${m[1] || m[2]}`);
    if (/\.(mp4|m3u8)(\?|$)/i.test(u)) k.add(`media:${noQuery(u)}`);
  }
  if (v.href) k.add(`url:${canonUrl(v.href)}`);
  if (v.thumb && !/ytimg\.com/.test(v.thumb)) k.add(`thumb:${noQuery(v.thumb)}`); // YouTube-thumbs zitten al in yt:<id>
  return [...k];
}

const STOP = new Set("de het een en van in op te voor met is zijn er dat die bij uit aan om ook als naar over na door nog niet wel maar dan was wordt worden the a an of to and video nieuws".split(" "));
export function titleTokens(t: string): string[] {
  const s = (t || "")
    .replace(/\s[|•–—-]\s[^|•–—-]{2,40}$/u, " ") // "… | RTL Nieuws" / "– NOS"
    .replace(/#[\p{L}\d_]+/gu, " ")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9 ]+/g, " ");
  return [...new Set(s.split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)))];
}
function sameTitle(a: string[], b: string[]): boolean {
  if (a.length < 4 || b.length < 4) return a.length >= 2 && a.join(" ") === b.join(" ") && a.join(" ").length >= 12;
  const B = new Set(b);
  let n = 0;
  for (const w of a) if (B.has(w)) n++;
  return n / (a.length + b.length - n) >= 0.8;
}

// sameCaption vergelijkt elk paar: genormaliseerde tekst per video één keer maken (O(n) i.p.v. O(n²) regex-werk).
const captionCache = new WeakMap<DVideo, { titel?: string; ai?: string; res: string[] }>();
function caption(v: DVideo): string[] {
  const c = captionCache.get(v);
  if (c && c.titel === v.titel && c.ai === v.ai) return c.res;
  const res = captionBereken(v);
  captionCache.set(v, { titel: v.titel, ai: v.ai, res });
  return res;
}
function captionBereken(v: DVideo): string[] {
  const norm = (s: string) => s.replace(/#[\p{L}\d_]+/gu, " ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const titel = norm(v.titel || ""), ai = norm(v.ai || "");
  return [...new Set([ai, ai.startsWith(titel) ? ai : `${titel} ${ai}`.trim()].filter(Boolean))];
}
function sameCaption(a: DVideo, b: DVideo): boolean {
  let verschil: number;
  if (Number.isFinite(a._pub) && Number.isFinite(b._pub) && a._pub! > 0 && b._pub! > 0) verschil = Math.abs(a._pub! - b._pub!) / 60000;
  else {
    const minuten = (t?: string) => { const m = /^(\d{2}):(\d{2})$/.exec(t || ""); return m && +m[1] < 24 && +m[2] < 60 ? +m[1] * 60 + +m[2] : NaN; };
    verschil = Math.abs(minuten(a.tijd) - minuten(b.tijd));
  }
  if (!(verschil <= 180)) return false;
  for (const x of caption(a)) for (const y of caption(b)) {
    const xx = x.split(" "), yy = y.split(" ");
    let i = 0;
    while (i < xx.length && i < yy.length && xx[i] === yy[i]) i++;
    const begin = xx.slice(0, i).join(" ");
    if (begin.length >= 80 && titleTokens(begin).length >= 8) return true;
  }
  return false;
}

export function popNum(p?: string): number {
  const m = /([\d.,]+)\s*([kKmM]?)/.exec(p || "");
  if (!m) return 0;
  const n = parseFloat(m[1].replace(/\.(?=\d{3}\b)/g, "").replace(",", "."));
  return (Number.isFinite(n) ? n : 0) * (m[2].toLowerCase() === "m" ? 1e6 : m[2].toLowerCase() === "k" ? 1e3 : 1) * (/likes|kudos/i.test(p || "") ? 20 : 1);
}
function quality(v: DVideo): number {
  const e = `${v.embed || ""} ${v.href}`;
  const play = /youtube|youtu\.be/.test(e) ? 3 : /\.m3u8(\?|$)/i.test(v.embed || "") ? 2.6 : /\.mp4(\?|$)/i.test(v.embed || "") ? 2.4 : 0;
  return play * 100 + Math.log10(1 + popNum(v.populariteit));
}

/** Ontdubbelt `list` (volgorde van de beste kopie blijft). Alles wat ook in `against` staat (bijv. Dumpert) valt weg. */
export function dedupVideos<T extends DVideo>(list: T[], against: DVideo[] = []): { list: T[]; removed: number; groups: string[][] } {
  const blocked = new Set(against.flatMap(videoKeys));
  const blockedTitles = against.map((v) => titleTokens(v.titel));
  const parent = list.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const join = (a: number, b: number) => { const x = find(a), y = find(b); if (x !== y) parent[y] = x; };
  const byKey = new Map<string, number>();
  const keys = list.map(videoKeys);
  const toks = list.map((v) => titleTokens(v.titel));
  list.forEach((_, i) => { for (const k of keys[i]) { const j = byKey.get(k); if (j == null) byKey.set(k, i); else join(j, i); } });
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) if (find(i) !== find(j) && (sameTitle(toks[i], toks[j]) || sameCaption(list[i], list[j]))) join(i, j);
  const groups = new Map<number, number[]>();
  list.forEach((_, i) => { const r = find(i); (groups.get(r) || groups.set(r, []).get(r)!).push(i); });
  const out: { i: number; v: T }[] = [];
  let removed = 0;
  const report: string[][] = [];
  for (const idx of groups.values()) {
    if (idx.some((i) => keys[i].some((k) => blocked.has(k)) || blockedTitles.some((t) => sameTitle(toks[i], t)) || against.some((v) => sameCaption(list[i], v)))) { removed += idx.length; report.push(idx.map((i) => `${list[i].bron}: ${list[i].titel} (al bij Dumpert)`)); continue; }
    const best = idx.reduce((a, b) => (quality(list[b]) > quality(list[a]) ? b : a), idx[0]);
    const ook = [...(list[best].ook || [])];
    for (const i of idx) if (i !== best) {
      if (!ook.some((o) => canonUrl(o.href) === canonUrl(list[i].href))) ook.push({ bron: list[i].bron, href: list[i].href });
      for (const o of list[i].ook || []) if (!ook.some((x) => canonUrl(x.href) === canonUrl(o.href)) && canonUrl(o.href) !== canonUrl(list[best].href)) ook.push(o);
    }
    if (idx.length > 1) { removed += idx.length - 1; report.push(idx.map((i) => `${i === best ? "✓" : "×"} ${list[i].bron}: ${list[i].titel}`)); }
    out.push({ i: Math.min(...idx), v: ook.length ? { ...list[best], ook } : list[best] });
  }
  return { list: out.sort((a, b) => a.i - b.i).map((x) => x.v), removed, groups: report };
}
