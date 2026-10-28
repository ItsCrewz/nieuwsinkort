// nieuwsinkort-uur: elk uur (06:00–23:00 Amsterdam) feeds ophalen, samenvatten met Workers AI en in KV zetten.
// De Pages Function /data.json voegt dit samen met de data.json van de routine.
// Free plan: de cron zelf doet bijna niets (10 ms CPU); het werk gebeurt in Durable Objects (30 s CPU per verzoek)
// en het ophalen wordt verdeeld over meerdere Fetcher-DO's (elk max 50 externe verzoeken).
import { DurableObject } from "cloudflare:workers";
import { parseFeed, type Entry } from "./parse";
import { buildWeer, BR_URL, OM_URL, KNMI_VERW, KNMI_WAARSCH } from "./weer";
import { YT_NIEUWS, ytUrl, REDDIT_SUBS, redditUrl, DUMPERT_URL, parseDumpert, parseYouTube, parseRedditVideos, soortVan, igUser, igProfileUrl, igPostEmbed, parseIgProfile, igVideoUrl, igVideo, type Video } from "./videos";
import { summarize, inHetKort, simpelWeer, type Usage, type In, type Sum } from "./ai";
import { xUser, xPosts, xEntry, xVideo, X_VIDEO } from "./x";
import { dedupVideos } from "../../src/dedup";
import { uniekeBeelden, ogImage } from "../../src/beeld";

export interface Env {
  NIEUWS: KVNamespace; AI: Ai; RUNNER: DurableObjectNamespace<Runner>; FETCHER: DurableObjectNamespace<Fetcher>;
  RUN_KEY?: string; SITE: string; MODEL: string; SMALL_MODEL?: string; CAP?: string; BUDGET?: string;
}
const UA = "nieuwsinkort/1.0 (+https://nieuwsinkort.pages.dev)";
const TZ = "Europe/Amsterdam";

// ---------------------------------------------------------------- tijd
function ams(t = Date.now()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, min: +p.minute, s: +p.second, iso: `${p.year}-${p.month}-${p.day}`, hhmm: `${p.hour}:${p.minute}` };
}
function midnight(t = Date.now()) {
  const a = ams(t);
  const off = Date.UTC(a.y, a.m - 1, a.d, a.h, a.min, a.s) - Math.floor(t / 1000) * 1000; // offset in ms
  return Date.UTC(a.y, a.m - 1, a.d) - off;
}
const hhmm = (t: number) => ams(t).hhmm;
const datumNL = (t = Date.now()) => new Intl.DateTimeFormat("nl-NL", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(t));

// ---------------------------------------------------------------- fetcher-DO
type Job = { url: string; kind: "feed" | "json" | "text" | "dumpert" | "reddit" | "insta" | "og" | "x"; label?: string; sub?: string; max?: number; alleenVideo?: boolean };
type Res = { url: string; ok: boolean; status: number; err?: string; ms: number; via?: string; cachedAt?: number; entries?: Entry[]; newest?: number | null; total?: number; videos?: Video[]; json?: any; text?: string };

const IG_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const igGet = (url: string) => fetch(url, { headers: { "User-Agent": IG_UA, Accept: "text/html", "Accept-Language": "nl-NL,nl;q=0.9" }, signal: AbortSignal.timeout(15000) });

// Instagram: profiel-embed -> entries (bronstats) + van vandaag de video's met hun MP4 (max 3 per account).
async function runInsta(j: Job, since: number, t0: number, kv?: KVNamespace): Promise<Res> {
  const user = igUser(j.url);
  if (!user) throw new Error("onbekend Instagram-account");
  const r = await igGet(igProfileUrl(user));
  if (!r.ok) return { url: j.url, ok: false, status: r.status, err: `Instagram HTTP ${r.status}`, ms: Date.now() - t0 };
  const posts = parseIgProfile(await r.text());
  const now = Date.now() + 15 * 60e3;
  const entries: Entry[] = posts.map((p) => ({ t: (p.text.split("\n")[0] || `Post van @${p.user}`).slice(0, 160), l: `https://www.instagram.com/p/${p.code}/`, d: p.t || null, s: p.text.slice(0, 600), img: p.img }));
  const videos: Video[] = [];
  for (const p of posts.filter((p) => p.video && p.t >= since).slice(0, j.max ?? 3)) {
    try {
      // MP4-adres per post 20 uur in KV (ondertekend adres is enkele dagen geldig): elk uur alleen nieuwe reels opvragen
      const key = `ig:${p.code}`;
      let mp4 = (await kv?.get(key).catch(() => null)) || "";
      if (!mp4) {
        const e = await igGet(igPostEmbed(p.code));
        mp4 = e.ok ? igVideoUrl(await e.text()) : "";
        if (mp4) await kv?.put(key, mp4, { expirationTtl: 20 * 3600 }).catch(() => {});
      }
      if (mp4) videos.push(igVideo(p, mp4, j.label || user, hhmm));
    } catch { /* deze video overslaan */ }
  }
  return {
    url: j.url, ok: true, status: 200, ms: Date.now() - t0, total: entries.length, videos,
    newest: entries.reduce<number | null>((m, e) => (e.d && e.d <= now && (m == null || e.d > m) ? e.d : m), null),
    entries: entries.filter((e) => e.d != null && e.d >= since && e.d <= now),
  };
}

// og:image van een artikel (alleen als de feed zelf geen foto had). Leest alleen de <head>, 3 dagen in KV.
async function runOg(j: Job, t0: number, kv?: KVNamespace): Promise<Res> {
  const key = `og:${normLink(j.url)}`.slice(0, 500);
  const c = await kv?.get(key).catch(() => null);
  if (c != null) return { url: j.url, ok: true, status: 200, ms: Date.now() - t0, text: c };
  const r = await fetch(j.url, { headers: { "User-Agent": UA, Accept: "text/html" }, signal: AbortSignal.timeout(8000), redirect: "follow" });
  let html = "";
  if (r.ok && r.body && /html/i.test(r.headers.get("content-type") || "html")) {
    const rd = r.body.getReader(), dec = new TextDecoder();
    while (html.length < 250000) {
      const { done, value } = await rd.read();
      if (done) break;
      html += dec.decode(value, { stream: true });
      if (/<\/head>/i.test(html)) break;
    }
    rd.cancel().catch(() => {});
  } else r.body?.cancel().catch(() => {});
  const img = ogImage(html, r.url || j.url);
  if (r.ok || r.status === 404 || r.status === 403) await kv?.put(key, img, { expirationTtl: 3 * 86400 }).catch(() => {});
  return { url: j.url, ok: r.ok, status: r.status, ms: Date.now() - t0, text: img, ...(r.ok ? {} : { err: `HTTP ${r.status}` }) };
}

// X: fxtwitter -> syndication. Tekstposts als entries (bronstats + politiek), video's van vandaag als filmpjes.
async function runX(j: Job, since: number, t0: number): Promise<Res> {
  const user = xUser(j.url);
  if (!user) throw new Error("onbekend X-account");
  const { posts, via, err } = await xPosts(user);
  const now = Date.now() + 15 * 60e3;
  const entries = posts.filter((p) => !p.mp4).map(xEntry); // tekst/foto-posts naar het nieuws, video's naar Filmpjes
  const videos = posts.filter((p) => p.mp4 && p.t >= since).slice(0, j.max ?? 3).map((p) => xVideo(p, j.label || user, hhmm));
  return {
    url: j.url, ok: true, status: 200, ms: Date.now() - t0, via, ...(err ? { err } : {}), total: entries.length, videos,
    newest: entries.reduce<number | null>((m, e) => (e.d && e.d <= now && (m == null || e.d > m) ? e.d : m), null),
    entries: j.alleenVideo ? [] : entries.filter((e) => e.d != null && e.d >= since && e.d <= now),
  };
}

const FEED_UA = "Feedly/1.0 (+http://www.feedly.com/fetcher.html; like FeedFetcher-Google)";
const HN_RSS = /^https?:\/\/news\.ycombinator\.com\/rss\/?$/;
const BR_UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
async function get(url: string, timeout = 15000, ua = UA): Promise<Response> {
  // SRU (overheid.nl) geeft JSON terug zodra "application/json" in Accept staat: dan alleen XML vragen
  const accept = /\/sru\?/.test(url) ? "application/xml, text/xml" : "application/rss+xml, application/atom+xml, application/xml, text/xml, application/json, text/html;q=0.8, */*;q=0.5";
  // ORI-elastic zonder query geeft willekeurige documenten: nieuwste eerst
  if (/openraadsinformatie\.nl\/.*\/_search$/.test(url)) url += "?size=50&sort=start_date:desc&_source=name,start_date,last_discussed_at,date_modified,@type";
  return fetch(url, { headers: { "User-Agent": ua, Accept: accept, "Accept-Language": "nl-NL,nl;q=0.9,en;q=0.8" }, signal: AbortSignal.timeout(timeout), redirect: "follow" });
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function runJob(j: Job, since: number, kv?: KVNamespace): Promise<Res> {
  const t0 = Date.now();
  let status = 0;
  try {
    if (j.kind === "insta") return await runInsta(j, since, t0, kv);
    if (j.kind === "og") return await runOg(j, t0, kv);
    if (j.kind === "x") return await runX(j, since, t0);
    // news.ycombinator.com/rss geeft 419 aan Cloudflare-IP's: dezelfde HN-lijst via hnrss.org (werkt wel)
    const u = HN_RSS.test(j.url) ? "https://hnrss.org/best" : j.url;
    // Reddit: RSS met een feedlezer-UA (Feedly) wordt wél doorgelaten; bot/browser-UA krijgt 429/403 vanaf Cloudflare
    const ua1 = j.kind === "reddit" ? FEED_UA : UA;
    let r = await get(u, 15000, ua1).catch(async () => { await sleep(1500); return get(u, 20000, ua1); }); // 1x opnieuw bij time-out/netwerkfout
    // 403/429: nog één keer rustig; Reddit via old.reddit, anderen met een gewone browser-UA
    if (r.status === 403 || r.status === 429) {
      if (j.kind === "reddit") { await sleep(5000); r = await get(u.replace("://www.reddit.com", "://old.reddit.com"), 15000, FEED_UA); }
      else { await sleep(1500); r = await get(u, 15000, BR_UA); }
    }
    status = r.status;
    if (!r.ok) return { url: j.url, ok: false, status, err: `HTTP ${status}`, ms: Date.now() - t0 };
    const body = await r.text();
    const base: Res = { url: j.url, ok: true, status, ms: 0 };
    if (j.kind === "json") base.json = JSON.parse(body);
    else if (j.kind === "text") base.text = body.length > 400000 ? body.slice(0, 400000) : body;
    else if (j.kind === "dumpert") base.videos = parseDumpert(body, hhmm);
    else {
      if (/^\s*<!doctype html|^\s*<html/i.test(body.slice(0, 300))) throw new Error("HTML i.p.v. feed");
      const all = parseFeed(body, j.url);
      const now = Date.now() + 15 * 60e3;
      base.total = all.length;
      base.newest = all.reduce<number | null>((m, e) => (e.d && e.d <= now && (m == null || e.d > m) ? e.d : m), null);
      base.entries = all.filter((e) => e.d != null && e.d >= since && e.d <= now);
      if (/youtube\.com\/feeds/.test(j.url)) base.videos = parseYouTube(body, j.label || "YouTube", since, hhmm);
      if (j.kind === "reddit") base.videos = parseRedditVideos(body, j.sub || "", since, hhmm);
    }
    base.ms = Date.now() - t0;
    return base;
  } catch (e: any) {
    return { url: j.url, ok: false, status, err: String(e?.message || e).slice(0, 120), ms: Date.now() - t0 };
  }
}

export class Fetcher extends DurableObject<Env> {
  async fetch(req: Request): Promise<Response> {
    const { jobs, since } = (await req.json()) as { jobs: Job[]; since: number };
    const out: Res[] = new Array(jobs.length);
    const reddit = jobs.map((j, i) => [j, i] as const).filter(([j]) => j.kind === "reddit");
    const rest = jobs.map((j, i) => [j, i] as const).filter(([j]) => j.kind !== "reddit");
    const pool = async () => { for (let x; (x = rest.shift()); ) out[x[1]] = await this.mem(x[0], await runJob(x[0], since, this.env.NIEUWS), since); };
    const seq = async () => { for (let k = 0; k < reddit.length; k++) { if (k) await sleep(2000); out[reddit[k][1]] = await this.mem(reddit[k][0], await runJob(reddit[k][0], since), since); } };
    await Promise.all([seq(), ...Array.from({ length: reddit.length ? 3 : 4 }, pool)]);
    return Response.json(out);
  }
  // Social (X/Reddit/Instagram): laatste gelukte resultaat bewaren (DO-opslag, niet KV: geen schrijflimiet-zorgen).
  // Mislukt het ophalen, dan blijven de berichten van vandaag staan (ok blijft false, dus Bronnen zegt eerlijk "Ophalen mislukt").
  async mem(j: Job, r: Res, since: number): Promise<Res> {
    if (!["x", "reddit", "insta"].includes(j.kind)) return r;
    const key = `lg:${j.url}`;
    try {
      if (r.ok) { await this.ctx.storage.put(key, { at: Date.now(), entries: r.entries || [], videos: r.videos || [], newest: r.newest ?? null }); return r; }
      const c: any = await this.ctx.storage.get(key);
      if (c && c.at >= since) return { ...r, cachedAt: c.at, entries: c.entries, videos: c.videos, newest: c.newest };
    } catch { /* opslag optioneel */ }
    return r;
  }
}

// ---------------------------------------------------------------- clusteren
const STOP = new Set("de het een en van in op te voor met is zijn er dat die bij uit aan om ook als naar over na door nog niet wel maar dan was wordt worden heeft hebben meer dit deze tot kan nu zo al wat hoe waar wie ze hij zij we je jij u the a an of to in on for with and is are was be at by from as it its this that after over new says will has have can how why what who".split(" "));
const toks = (s: string) => new Set(s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)));
function sim(a: Set<string>, b: Set<string>) { let n = 0; for (const x of a) if (b.has(x)) n++; return { n, j: n / (a.size + b.size - n || 1) }; }
const normLink = (l: string) => l.replace(/^https?:\/\/(www\.)?/, "").replace(/[?#].*$/, "").replace(/\/$/, "").toLowerCase();

type Cand = { cat: string; site: string; href: string; t: string; s: string; d: number; img?: string };
type Cluster = { key: string; cat: string; c: Cand[]; tok: Set<string> };

function cluster(cands: Cand[]): Cluster[] {
  const out: Cluster[] = [];
  for (const c of cands.sort((a, b) => a.d - b.d)) {
    const tk = toks(c.t);
    let best: Cluster | null = null, bj = 0;
    for (const k of out) {
      const { n, j } = sim(tk, k.tok);
      if ((j >= 0.45 && n >= 2) || (n >= 4 && j >= 0.3)) if (j > bj) { bj = j; best = k; }
    }
    if (best) { best.c.push(c); for (const x of tk) best.tok.add(x); }
    else out.push({ key: normLink(c.href), cat: c.cat, c: [c], tok: tk });
  }
  return out;
}

// ---------------------------------------------------------------- runner-DO
const SOCIAL_INFO = /YouTube|Instagram|Reddit|Podcast/; // X (bv. Politie Haarlem) telt wel als nieuws
const NIET_ALS_NIEUWS = new Set(["burgernet", "gemeenteraadhaarlem"]);
const BEKENDMAKING_HINTS = /raadsbesluit|collegebesluit|verordening|verkeersbesluit|omgevingsplan|bestemmingsplan|apv|referendum|parkeer|evenement|sluiting|aanwijzing|exploitatie/i;
const NEWS_CATS = ["nl", "tech", "haarlem", "showbizz", "politiek"];

type State = { okAt?: Record<string, string>; kortAt?: number; datum: string; neurons: number; calls: number; sums: Record<string, Sum & { at: number }>; links: Record<string, string>; kortHash?: string; kort?: string; weerHash?: string; weerTxt?: string; runs: number };

export class Runner extends DurableObject<Env> {
  async fetch(req: Request): Promise<Response> {
    const u = new URL(req.url);
    const force = u.searchParams.get("force") === "1";
    try {
      const r = await this.run(force);
      return Response.json(r);
    } catch (e: any) {
      return Response.json({ ok: false, err: String(e?.stack || e) }, { status: 500 });
    }
  }

  async run(force: boolean) {
    const env = this.env, T0 = Date.now(), now = Date.now(), A = ams(now), since = midnight(now);
    const model = env.MODEL, CAP = +(env.CAP || 40), BUDGET = +(env.BUDGET || 9000);
    const site = env.SITE.replace(/\/$/, "");
    const [bronnenR, staticR, stateRaw] = await Promise.all([
      fetch(`${site}/bronnen.json?t=${now}`, { headers: { "User-Agent": UA } }),
      fetch(`${site}/data.json?statisch=1&t=${now}`, { headers: { "User-Agent": UA } }),
      env.NIEUWS.get("state", "json") as Promise<State | null>,
    ]);
    const bronnen: any = await bronnenR.json();
    const stat: any = staticR.ok ? await staticR.json().catch(() => null) : null;
    let st: State = stateRaw && stateRaw.datum === A.iso ? stateRaw : { datum: A.iso, neurons: 0, calls: 0, sums: {}, links: {}, runs: 0, okAt: stateRaw?.okAt || {} };
    st.okAt ||= {};
    st.runs++;

    // ---- jobs
    const jobs = new Map<string, Job>();
    const add = (j: Job) => { if (!jobs.has(j.url)) jobs.set(j.url, j); };
    const srcFeeds: { key: string; g: string; s: any; urls: string[] }[] = [];
    for (const g of bronnen.groepen || []) for (const s of g.bronnen || []) {
      const urls: string[] = (s.feeds || []).map((f: any) => f.url).filter(Boolean);
      if (!urls.length) continue;
      srcFeeds.push({ key: `${g.id}|${s.id}`, g: g.id, s, urls });
      for (const url of urls) {
        const sub = /reddit\.com\/r\/([^/]+)/.exec(url)?.[1];
        add({ url, kind: sub ? "reddit" : igUser(url) ? "insta" : xUser(url) ? "x" : "feed", sub, label: s.naam.replace(/^Instagram\s+|\s*\(Kittygram\)$/g, ""), ...(g.id === "politiek" ? { max: 2 } : {}) });
      }
    }
    for (const [naam, cid] of Object.entries(YT_NIEUWS)) add({ url: ytUrl(cid), kind: "feed", label: naam });
    for (const sub of REDDIT_SUBS) add({ url: redditUrl(sub), kind: "reddit", sub });
    for (const [u, naam] of Object.entries(X_VIDEO)) add({ url: `https://x.com/${u}`, kind: "x", label: naam, alleenVideo: true });
    // reddit-URL uit bronnen.json kan ?t=day zonder sub-label zijn: label alsnog zetten
    for (const j of jobs.values()) if (j.kind === "reddit") j.sub ||= /reddit\.com\/r\/([^/]+)/.exec(j.url)?.[1];
    add({ url: DUMPERT_URL, kind: "dumpert" });
    add({ url: BR_URL, kind: "json" }); add({ url: OM_URL, kind: "json" });
    add({ url: KNMI_VERW, kind: "text" }); add({ url: KNMI_WAARSCH, kind: "text" });

    const all = [...jobs.values()];
    const reddit = all.filter((j) => j.kind === "reddit"), insta = all.filter((j) => j.kind === "insta"), xj = all.filter((j) => j.kind === "x");
    const rest = all.filter((j) => !["reddit", "insta", "x"].includes(j.kind));
    const batches: Job[][] = [reddit];
    // X apart en vast verdeeld (zelfde DO = zelfde 'laatst gelukt'-geheugen): 1 verzoek per account, terugval 1 extra
    for (let i = 0; i < xj.length; i += 15) batches.push(xj.slice(i, i + 15));
    // Instagram apart: per account 1 profiel + max 3 video-embeds = max 4 verzoeken (DO-limiet 50)
    for (let i = 0; i < insta.length; i += 10) batches.push(insta.slice(i, i + 10));
    for (let i = 0; i < rest.length; i += 30) batches.push(rest.slice(i, i + 30));
    const results = (await Promise.all(batches.map(async (b, i) => {
      if (!b.length) return [] as Res[];
      const naam = b[0].kind === "reddit" ? "reddit" : b[0].kind === "x" ? `x${i}` : b[0].kind === "insta" ? `ig${i}` : `f${i}`;
      const stub = env.FETCHER.get(env.FETCHER.idFromName(naam));
      const r = await stub.fetch("https://do/f", { method: "POST", body: JSON.stringify({ jobs: b, since }) });
      return (await r.json()) as Res[];
    }))).flat();
    const R = new Map(results.map((r) => [r.url, r]));
    const T1 = Date.now();

    // ---- bronstats
    const bronstats: Record<string, { vandaag: number | null; laatste?: string; fout?: string; ok?: string }> = {};
    const nowIso = new Date(now).toISOString();
    for (const f of srcFeeds) {
      const rs = f.urls.map((u) => R.get(u)).filter(Boolean) as Res[];
      const ok = rs.filter((r) => r.ok);
      if (!ok.length) { bronstats[f.key] = { vandaag: null, fout: rs.map((r) => r.err).filter(Boolean).join("; ").slice(0, 80) || "geen antwoord", ...(st.okAt![f.key] ? { ok: st.okAt![f.key] } : {}) }; continue; }
      st.okAt![f.key] = nowIso;
      const seen = new Set<string>();
      let newest: number | null = null;
      for (const r of ok) {
        for (const e of r.entries || []) seen.add(normLink(e.l || e.t));
        if (r.newest && (newest == null || r.newest > newest)) newest = r.newest;
      }
      const o: any = { vandaag: seen.size, ok: nowIso };
      if (newest) o.laatste = new Date(newest).toISOString();
      if (ok.length < rs.length) o.fout = `${rs.length - ok.length} van ${rs.length} feeds niet bereikbaar`;
      bronstats[f.key] = o;
    }

    // Filmpjes/Dumpert: per platform één regel in Bronnen (laatst gelukt / Ophalen mislukt)
    const vidStat = (key: string, js: Job[]) => {
      const rs = js.map((j) => R.get(j.url)).filter(Boolean) as Res[];
      if (!rs.length) return;
      const ok = rs.filter((r) => r.ok);
      const n = rs.reduce((a, r) => a + (r.videos?.length || 0), 0);
      if (!ok.length) { bronstats[key] = { vandaag: null, fout: [...new Set(rs.map((r) => r.err).filter(Boolean))].join("; ").slice(0, 80) || "geen antwoord", ...(st.okAt![key] ? { ok: st.okAt![key] } : {}) }; return; }
      st.okAt![key] = nowIso;
      bronstats[key] = { vandaag: n, ok: nowIso, ...(ok.length < rs.length ? { fout: `${rs.length - ok.length} van ${rs.length} niet bereikbaar` } : {}) };
    };
    vidStat("filmpjes|youtube", Object.values(YT_NIEUWS).map((cid) => ({ url: ytUrl(cid), kind: "feed" } as Job)));
    vidStat("filmpjes|reddit", REDDIT_SUBS.map((sub) => ({ url: redditUrl(sub), kind: "reddit" } as Job)));
    vidStat("filmpjes|instagram", insta);
    vidStat("filmpjes|x", xj);
    vidStat("dumpert|dumpert", [{ url: DUMPERT_URL, kind: "dumpert" }]);

    // ---- nieuws-kandidaten
    const cands: Cand[] = [];
    const seenL = new Set<string>();
    for (const f of srcFeeds) {
      // Politiek: ook Instagram/YouTube-posts van partijen zijn 'nieuws' (eigen rubriek); andere social-bronnen niet.
      if (!NEWS_CATS.includes(f.g) || (f.g !== "politiek" && SOCIAL_INFO.test(f.s.info || "")) || NIET_ALS_NIEUWS.has(f.s.id)) continue;
      for (const u of f.urls) {
        if (/known_exploited|\.json($|\?)/.test(u)) continue;
        for (const e of R.get(u)?.entries || []) {
          if (!e.t || !e.l) continue;
          if (f.s.id === "officielebekendmakingen" && !BEKENDMAKING_HINTS.test(e.t + " " + e.s)) continue;
          const k = normLink(e.l);
          if (seenL.has(k)) continue;
          seenL.add(k);
          cands.push({ cat: f.g, site: f.s.naam, href: e.l, t: e.t, s: e.s, d: e.d!, img: e.img });
        }
      }
    }
    let clusters = cluster(cands);
    // Een politieke post over hetzelfde verhaal hoort bij dat nieuwsbericht (rubriek van het nieuws, partij als extra bron)
    for (const k of clusters) k.cat = k.c.find((c) => c.cat !== "politiek")?.cat || "politiek";

    // ---- wat de routine (08:00) al heeft: niet opnieuw samenvatten
    const statToday = stat && typeof stat.gegenereerd === "string" && ams(Date.parse(stat.gegenereerd)).iso === A.iso;
    const statItems: any[] = statToday ? stat.items || [] : [];
    const statLinks = new Set(statItems.flatMap((i: any) => (i.bronnen || []).map((b: any) => normLink(b.href || ""))));
    const statTok = statItems.map((i: any) => toks(`${i.kop} ${i.ai}`));
    const covered = (k: Cluster) => k.c.some((c) => statLinks.has(normLink(c.href))) || statTok.some((t) => { const { n, j } = sim(k.tok, t); return n >= 4 && j >= 0.25; });
    const nCovered = clusters.filter(covered).length;
    clusters = clusters.filter((k) => !covered(k));

    // ---- samenvattingen: cache (per link), dan nieuwe tot CAP / budget
    const sumOf = (k: Cluster) => { for (const c of k.c) { const id = st.links[normLink(c.href)]; if (id && st.sums[id]) return st.sums[id]; } return null; };
    const usage: Usage = { neurons: 0, calls: 0, fails: 0, inTok: 0, outTok: 0 };
    // Alleen-politiek (losse partijposts) nooit door de AI: die tonen we zoals de partij ze schrijft.
    const todo = clusters.filter((k) => !sumOf(k) && k.cat !== "politiek");
    // ---- AI-budget in trappen (gratis = 10.000 neuronen/dag, BUDGET = eigen plafond daaronder)
    //  <70%: hoofdmodel voor alles · 70–90%: klein model, minder berichten · 90–100%: klein model, alleen NL/Haarlem · daarna: geen AI.
    // Per run hooguit 2x het eerlijke deel van wat er nog over is, zodat ook de late uren samenvattingen krijgen.
    const SMALL = env.SMALL_MODEL || "@cf/meta/llama-3.2-1b-instruct";
    // video-samenvattingen op verzoek (functions/samenvatting.ts) tellen mee in hetzelfde dagbudget
    const vidN = +((await env.NIEUWS.get(`vid-neurons:${A.iso}`).catch(() => null)) || 0) || 0;
    const used = () => st.neurons + vidN + usage.neurons;
    const tier = () => (used() < 0.7 * BUDGET ? 1 : used() < 0.9 * BUDGET ? 2 : used() < BUDGET ? 3 : 4);
    const runsLeft = Math.max(1, 23 - A.h + 1);
    const runBudget = Math.max(300, ((BUDGET - st.neurons - vidN) / runsLeft) * 2);
    const tier0 = tier();
    let runCapped = false;
    const modelsUsed = new Set<string>();
    // prioriteit: meer bronnen eerst, dan nieuwste; eerlijk verdeeld over rubrieken
    const byCat: Record<string, Cluster[]> = {};
    for (const k of todo.sort((a, b) => b.c.length - a.c.length || Math.max(...b.c.map((c) => c.d)) - Math.max(...a.c.map((c) => c.d)))) (byCat[k.cat] ||= []).push(k);
    const pick: Cluster[] = [];
    const ROUND = tier0 >= 3 ? ["nl", "nl", "haarlem"] : ["nl", "nl", "tech", "haarlem", "showbizz"];
    const capN = tier0 === 1 ? CAP : tier0 === 2 ? Math.min(CAP, 15) : tier0 === 3 ? 8 : 0;
    while (pick.length < capN && Object.values(byCat).some((l) => l.length))
      for (const c of ROUND) { const x = byCat[c]?.shift(); if (x && pick.length < capN) pick.push(x); }
    let quotaOut = st.neurons + vidN >= BUDGET;
    const modelNu = () => { const m = tier() === 1 ? model : SMALL; modelsUsed.add(m); return m; };
    const toIn = (k: Cluster, id: number): In => {
      const cs = k.c.slice(0, 4);
      return { id, cat: k.cat, bronnen: [...new Set(cs.map((c) => c.site))], titels: [...new Set(cs.map((c) => c.t))].slice(0, 3), tekst: cs.map((c) => c.s).join(" // ").slice(0, 900) };
    };
    const groups: Cluster[][] = [];
    for (let i = 0; i < pick.length; i += 5) groups.push(pick.slice(i, i + 5));
    const doGroup = async (g: Cluster[]) => {
      if (quotaOut || used() >= BUDGET) { quotaOut = true; return; }
      if (usage.neurons >= runBudget) { runCapped = true; return; }
      try {
        const res = await summarize(env.AI, modelNu(), g.map((k, i) => toIn(k, i + 1)), usage);
        g.forEach((k, i) => {
          const s = res.get(i + 1);
          if (!s) return;
          const id = k.key;
          st.sums[id] = { ...s, at: now };
          for (const c of k.c) st.links[normLink(c.href)] = id;
        });
      } catch (e: any) {
        usage.fails++;
        if (/quota|limit|429|neuron|exceed/i.test(String(e?.message || e))) quotaOut = true;
      }
    };
    for (let i = 0; i < groups.length; i += 3) await Promise.all(groups.slice(i, i + 3).map(doGroup));

    // ---- items opbouwen
    const firstSentence = (s: string) => (s.match(/^.{20,240}?[.!?](\s|$)/)?.[0] || s.slice(0, 200)).trim();
    const isNL = (k: Cluster) => k.c.some((c) => /\.nl(\/|$)/.test(new URL(c.href).hostname + "/"));
    const noAI = quotaOut || runCapped || !env.AI;
    const politiekLos = clusters.filter((k) => k.cat === "politiek").sort((a, b) => Math.max(...b.c.map((c) => c.d)) - Math.max(...a.c.map((c) => c.d))).slice(0, 40);
    const shown = clusters.filter((k) => sumOf(k) || (k.cat === "politiek" ? politiekLos.includes(k) : noAI && isNL(k) && k.c[0].s));
    // ---- foto's: uit de feeds; ontbreekt die bij een bron, dan og:image van het artikel (gecachet in KV)
    const ogLinks = [...new Set(shown.flatMap((k) => k.c.filter((c) => !c.img && !/instagram\.com|youtube\.com|youtu\.be|reddit\.com|x\.com|twitter\.com/.test(c.href)).slice(0, 3).map((c) => c.href)))].slice(0, 120);
    const og = new Map<string, string>();
    const ogB: Job[][] = [];
    for (let i = 0; i < ogLinks.length; i += 30) ogB.push(ogLinks.slice(i, i + 30).map((url) => ({ url, kind: "og" as const })));
    try {
      const rs = (await Promise.all(ogB.map(async (b, i) => (await env.FETCHER.get(env.FETCHER.idFromName(`og${i}`)).fetch("https://do/f", { method: "POST", body: JSON.stringify({ jobs: b, since }) })).json() as Promise<Res[]>))).flat();
      for (const r of rs) if (r?.text) og.set(r.url, r.text);
    } catch { /* zonder og-foto's verder */ }
    const items: any[] = [];
    for (const k of shown) {
      const s = sumOf(k);
      const first = Math.min(...k.c.map((c) => c.d));
      const bron = [...new Map(k.c.map((c) => [c.site, { site: c.site, href: c.href }])).values()].slice(0, 6);
      const beelden = uniekeBeelden(k.c.flatMap((c) => [c.img, og.get(c.href)]));
      const bb = beelden.length ? { beelden } : {};
      if (s) items.push({ cat: k.cat, kop: s.kop, ai: s.ai, samenvatting: s.samenvatting, punten: s.punten, tijd: hhmm(first), bronnen: bron, ...bb, _t: first, uur: true });
      else {
        const desc = (k.c[0].s || k.c[0].t.replace(/\s*(…|\.\.\.)$/, "")).replace(/\s+/g, " ").trim();
        // kop = eerste zin van de post (partijposts hebben geen aparte titel); korte tekst = wat daarna komt, nooit twee keer hetzelfde
        const zin = desc.match(/^.{15,120}?[.!?](\s|$)/)?.[0]?.trim();
        const knip = desc.length > 120 ? desc.slice(0, 117).replace(/\s+\S*$/, "") : desc;
        const kop = zin || (knip.length < desc.length ? knip + "…" : knip);
        const rest = desc.slice((zin || knip).length).replace(/^[\s.!?,:;…-]+/, "");
        const ai = rest ? firstSentence(rest) : "";
        if (k.cat === "politiek") items.push({ cat: k.cat, kop, ai, samenvatting: rest.slice(0, 700), punten: [], tijd: hhmm(first), bronnen: bron, ...bb, _t: first, uur: true, ruw: true });
        else items.push({ cat: k.cat, kop: k.c[0].t.slice(0, 120), ai: firstSentence(desc), samenvatting: desc.slice(0, 700), punten: [], tijd: hhmm(first), bronnen: bron, ...bb, _t: first, uur: true, ruw: true });
      }
    }
    items.sort((a, b) => b._t - a._t);
    for (const i of items) delete i._t;

    // ---- In het kort (één keer per run, alleen als de berichten veranderd zijn)
    const lijst = [...items.filter((i) => !i.ruw), ...statItems].slice(0, 70);
    const order = ["nl", "tech", "haarlem", "showbizz"];
    const lines = order.flatMap((c) => lijst.filter((i) => i.cat === c).slice(0, c === "nl" ? 22 : 10)).map((i) => `${i.cat}: ${i.kop} — ${i.ai}`);
    const kh = await hash(lines.join("\n"));
    let kort = st.kort || "";
    // trap 1: elke keer als het nieuws verandert; trap 2: klein model, hooguit elke 3 uur; trap 3+: niet meer
    const kortMag = tier() === 1 || (tier() === 2 && now - (st.kortAt || 0) > 3 * 3600e3);
    if ((kh !== st.kortHash || force) && lines.length && !quotaOut && kortMag) {
      try { const k = await inHetKort(env.AI, modelNu(), lines, usage); if (k.length > 40) st.kortAt = now; if (k.length > 40) { kort = k; st.kort = k; st.kortHash = kh; } } catch { usage.fails++; }
    }

    // ---- weer
    const W = buildWeer(R.get(BR_URL)?.json, R.get(OM_URL)?.json, R.get(KNMI_VERW)?.text || null, R.get(KNMI_WAARSCH)?.text || null, A.iso, A.hhmm);
    if (W.knmiTekst) {
      const wh = await hash(W.knmiTekst);
      if (wh !== st.weerHash && !quotaOut && tier() <= 2) {
        try { const t = await simpelWeer(env.AI, modelNu(), W.knmiTekst, usage); if (t.length > 30) { st.weerTxt = t; st.weerHash = wh; } } catch { usage.fails++; }
      }
      if (st.weerHash === wh && st.weerTxt) W.weer.verwachting = st.weerTxt;
    }

    // ---- filmpjes + dumpert
    let dumpert = (R.get(DUMPERT_URL)?.videos || []) as (Video & { _pub: number })[];
    const dToday = dumpert.filter((v) => v._pub >= since);
    dumpert = (dToday.length >= 8 ? dToday : dumpert.filter((v) => v._pub >= now - 24 * 3600e3)).slice(0, 25);
    const statD = new Map<string, any>((stat?.dumpert || []).map((v: any) => [v.href, v]));
    const kortAi = (s: string) => (s.length > 140 ? s.slice(0, 137).replace(/\s+\S*$/, "") + "…" : s);
    const dOut = dumpert.map(({ _score, _pub, ...v }) => ({ ...v, ai: statD.get(v.href)?.ai || kortAi(v.ai) }));
    const fv: Video[] = [];
    for (const [naam, cid] of Object.entries(YT_NIEUWS)) for (const v of R.get(ytUrl(cid))?.videos || []) fv.push({ ...v, ai: kortAi(v.ai), ...({ _k: naam } as any) });
    for (const sub of REDDIT_SUBS) for (const v of R.get(redditUrl(sub))?.videos || []) fv.push(v);
    for (const j of insta) for (const v of R.get(j.url)?.videos || []) fv.push(v);
    for (const j of xj) for (const v of R.get(j.url)?.videos || []) if (v.embed) fv.push({ ...v, ai: kortAi(v.ai) });
    // YouTube-kanalen van partijen/overheid (bronnen.json, Politiek): max 2 per kanaal
    for (const f of srcFeeds) if (f.g === "politiek") for (const u of f.urls) if (/youtube\.com\/feeds/.test(u)) for (const v of (R.get(u)?.videos || []).slice(0, 2)) fv.push({ ...v, ai: kortAi(v.ai) });
    // Shorts en Journaals apart, elk met een eigen plafond (anders drukken de Shorts de journaals weg)
    // Geen dubbele filmpjes: zelfde video-id/clip op meerdere platforms, tracking-parameters, bijna-gelijke titels.
    // Beste kopie blijft (in de site afspeelbaar, beste kwaliteit, populairst); wat al bij Dumpert staat valt hier weg.
    const dD = dedupVideos(dOut as any[]);
    dOut.splice(0, dOut.length, ...(dD.list as any[]));
    const dF = dedupVideos(fv.sort((a, b) => (b._score || 0) - (a._score || 0)).map((v) => ({ ...v, soort: soortVan(v) })), dOut);
    const uniek = dF.list;
    const fOut = [...uniek.filter((v) => v.soort === "short").slice(0, 18), ...uniek.filter((v) => v.soort === "journaal").slice(0, 14)]
      .map(({ _score, _pub, ...v }: any) => { delete v._k; return v; });

    // ---- wegschrijven
    st.neurons += usage.neurons; st.calls += usage.calls;
    const out = {
      datum: datumNL(now), gegenereerd: new Date(now).toISOString(), dag_samenvatting: kort, weer: W.weer, filmpjes: fOut, dumpert: dOut, items, bronstats,
      meta: { model, routine: stat?.gegenereerd || null, nieuweSamenvattingen: Object.values(st.sums).filter((s) => s.at === now).length, kandidaten: cands.length, clusters: clusters.length + nCovered, alInRoutine: nCovered, items: items.length, ruw: items.filter((i) => i.ruw).length, quotaOp: quotaOut, aiStand: ["", "normaal", "zuinig", "krap", "op"][quotaOut ? 4 : tier()], aiModellen: [...modelsUsed], runBudget: Math.round(runBudget), runVol: runCapped, dubbeleFilmpjes: dF.removed + dD.removed, dubbelVoorbeelden: [...dD.groups, ...dF.groups].slice(0, 8), metFoto: items.filter((i) => i.beelden?.length).length, ogOpgehaald: ogLinks.length, neuronenRun: Math.round(usage.neurons), neuronenVandaag: Math.round(st.neurons), neuronenVideo: Math.round(vidN), aiCalls: usage.calls, aiFouten: usage.fails, feeds: results.length, feedsFout: results.filter((r) => !r.ok).map((r) => `${r.url} ${r.err}`), msOphalen: T1 - T0, msTotaal: Date.now() - T0 },
    };
    // oude samenvattingen (niet meer in de feeds) opruimen
    const live = new Set(clusters.map((k) => k.key));
    for (const id of Object.keys(st.sums)) if (!live.has(id) && now - st.sums[id].at > 6 * 3600e3) { delete st.sums[id]; }
    for (const [l, id] of Object.entries(st.links)) if (!st.sums[id]) delete st.links[l];
    await Promise.all([env.NIEUWS.put("uur", JSON.stringify(out)), env.NIEUWS.put("state", JSON.stringify(st))]);
    return { ok: true, ...out.meta, gegenereerd: out.gegenereerd };
  }
}
async function hash(s: string) {
  const b = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

// ---------------------------------------------------------------- worker
export default {
  async scheduled(ev: ScheduledController, env: Env, ctx: ExecutionContext) {
    const h = ams(ev.scheduledTime).h;
    if (h < 6 || h > 23) return; // cron draait in UTC; dit houdt het op 06:00–23:00 Amsterdam (zomer- en wintertijd)
    const stub = env.RUNNER.get(env.RUNNER.idFromName("runner"));
    const r = await stub.fetch("https://do/run");
    console.log((await r.text()).slice(0, 2000));
  },
  async fetch(req: Request, env: Env): Promise<Response> {
    const u = new URL(req.url);
    if (u.pathname === "/run") {
      if (!env.RUN_KEY || u.searchParams.get("key") !== env.RUN_KEY) return new Response("nee", { status: 403 });
      const stub = env.RUNNER.get(env.RUNNER.idFromName("runner"));
      return stub.fetch(`https://do/run?force=${u.searchParams.get("force") || ""}`);
    }
    if (u.pathname === "/uur") {
      if (!env.RUN_KEY || u.searchParams.get("key") !== env.RUN_KEY) return new Response("nee", { status: 403 });
      return new Response((await env.NIEUWS.get("uur")) || "{}", { headers: { "content-type": "application/json" } });
    }
    if (u.pathname === "/status") {
      const d: any = await env.NIEUWS.get("uur", "json");
      return Response.json(d ? { gegenereerd: d.gegenereerd, ...d.meta } : { leeg: true });
    }
    return new Response("nieuwsinkort-uur", { status: 200 });
  },
};
