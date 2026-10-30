import type { LlmState } from "./llm";
// nieuwsinkort-uur: elk uur (06:00–23:00 Amsterdam) feeds ophalen, samenvatten met Workers AI en in KV zetten.
// De Pages Function /data.json voegt dit samen met de data.json van de routine.
// Free plan: de cron zelf doet bijna niets (10 ms CPU); het werk gebeurt in Durable Objects (30 s CPU per verzoek)
// en het ophalen wordt verdeeld over meerdere Fetcher-DO's (elk max 50 externe verzoeken).
import { publicatieTijd, vanVandaag, nieuwsteTijd } from "../../src/vandaag";
import { ams, midnight } from "../../src/tijd";
import { begrensOg, schrijfRun } from "../../src/kv";
import { bewaakteRun } from "./run-status";
import { DurableObject } from "cloudflare:workers";
import { parseFeed, type Entry } from "./parse";
import { buildWeer, BR_URL, OM_URL, KNMI_VERW } from "./weer";
import { YT_NIEUWS, ytUrl, REDDIT_SUBS, redditUrl, DUMPERT_URL, parseDumpert, parseYouTube, parseRedditVideos, soortVan, selecteerFilmpjes, igUser, igProfileUrl, igPostEmbed, parseIgProfile, igVideoUrl, igVideo, type Video } from "./videos";
import { summarize, inHetKort, simpelWeer, verdiep, type Usage, type In, type Sum, type Diep } from "./ai";
import { artikelTekst, jinaTekst } from "./artikel";
import { externeUrl, externeFetch } from "./url";
import { REDLIB, redlibPath, redlibToAtom } from "./redlib";
import { vooraf, MAX_ALARMS_PER_UUR } from "./vooraf";
import { xUser, xPosts, xEntry, xVideo, X_VIDEO } from "./x";
import { dedupVideos } from "../../src/dedup";
import { uniekeBeelden, ogImage } from "../../src/beeld";
import { isNL } from "../../src/bronlink";
import { extractief } from "./extractief";
import { isBuitenland } from "../../src/regio";
import { cluster, normLink, sim, toks, type Cand, type Cluster } from "./cluster";
import { Budget, utcDag, neuronFactor, aiFout, nieuwsNeuronen, zetDagTeller, quotaSleutel } from "./budget";
import { clusterHash, vindClusterSum } from "./clusterhash";
import { maakTabSam, tabTekst, tabAiRoute } from "./tabsam";
import { herindeel } from "../../src/regio";
import { herindeelSport, sportCat } from "./sportcat";
import { herindeelShow, showCat, nietAlsNieuws } from "./showcat";

export { Budget };

export function kiesVoorAI<T>(byCat: Record<string, T[]>, tier: number, capN: number): T[] {
  const ronde = tier >= 3 ? ["nl", "nl", "haarlem"] : ["nl", "nl", "tech", "haarlem", "showbizz"];
  const pick: T[] = [];
  if (tier < 3) {
    for (const c of ["f1", "voetbal", "auto"]) {
      if (pick.length >= capN) break;
      const x = byCat[c]?.shift();
      if (x !== undefined) pick.push(x);
    }
  }
  while (pick.length < capN && ronde.some((c) => byCat[c]?.length)) {
    for (const c of ronde) {
      if (pick.length >= capN) break;
      const x = byCat[c]?.shift();
      if (x !== undefined) pick.push(x);
    }
  }
  return pick;
}

export interface Env {
  NIEUWS: KVNamespace; AI: Ai; RUNNER: DurableObjectNamespace<Runner>; FETCHER: DurableObjectNamespace<Fetcher>; BUDGET_DO: DurableObjectNamespace<Budget>;
  RUN_KEY?: string; GROQ_API_KEY?: string; MISTRAL_API_KEY?: string; MISTRAL_MAAND_TOKENS?: string; SITE: string; MODEL: string; SMALL_MODEL?: string; CAP?: string; BUDGET?: string; NEURON_FACTOR?: string;
}
const UA = "nieuwsinkort/1.0 (+https://nieuwsinkort.pages.dev)";
const TZ = "Europe/Amsterdam";

// ---------------------------------------------------------------- tijd
const hhmm = (t: number) => ams(t).hhmm;
const datumNL = (t = Date.now()) => new Intl.DateTimeFormat("nl-NL", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(t));

// ---------------------------------------------------------------- fetcher-DO
type Job = { url: string; kind: "feed" | "json" | "text" | "dumpert" | "reddit" | "insta" | "og" | "x" | "art" | "artj"; label?: string; sub?: string; max?: number; alleenVideo?: boolean };
type Res = { kvWrites?: number; url: string; ok: boolean; status: number; err?: string; ms: number; via?: string; cachedAt?: number; entries?: Entry[]; newest?: number | null; total?: number; videos?: Video[]; json?: any; text?: string };

const IG_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const igGet = (url: string) => fetch(url, { headers: { "User-Agent": IG_UA, Accept: "text/html", "Accept-Language": "nl-NL,nl;q=0.9" }, signal: AbortSignal.timeout(15000) });

// Instagram: profiel-embed -> entries (bronstats) + van vandaag de video's met hun MP4 (max 3 per account).
async function runInsta(j: Job, _since: number, t0: number, kv?: KVNamespace): Promise<Res> {
  const user = igUser(j.url);
  if (!user) throw new Error("onbekend Instagram-account");
  const r = await igGet(igProfileUrl(user));
  if (!r.ok) return { url: j.url, ok: false, status: r.status, err: `Instagram HTTP ${r.status}`, ms: Date.now() - t0 };
  const posts = parseIgProfile(await r.text());
  const now = Date.now();
  const entries: Entry[] = posts.map((p) => ({ t: (p.text.split("\n")[0] || `Post van @${p.user}`).slice(0, 160), l: `https://www.instagram.com/p/${p.code}/`, d: p.t || null, s: p.text.slice(0, 600), img: p.img }));
  const videos: Video[] = [];
  let kvWrites = 0;
  for (const p of posts.filter((p) => p.video && vanVandaag(p.t, now)).slice(0, j.max ?? 3)) {
    try {
      // MP4-adres per post 20 uur in KV (ondertekend adres is enkele dagen geldig): elk uur alleen nieuwe reels opvragen
      const key = `ig:${p.code}`;
      let mp4 = (await kv?.get(key).catch(() => null)) || "";
      if (!mp4) {
        const e = await igGet(igPostEmbed(p.code));
        mp4 = e.ok ? igVideoUrl(await e.text()) : "";
        if (mp4 && kv) { kvWrites++; await kv.put(key, mp4, { expirationTtl: 20 * 3600 }).catch(() => {}); }
      }
      if (mp4) videos.push(igVideo(p, mp4, j.label || user, hhmm));
    } catch { /* deze video overslaan */ }
  }
  return {
    url: j.url, ok: true, status: 200, ms: Date.now() - t0, total: entries.length, videos, kvWrites,
    newest: entries.reduce<number | null>((m, e) => (e.d && e.d <= now && (m == null || e.d > m) ? e.d : m), null),
    entries: entries.flatMap((e) => { const d = publicatieTijd(e.d, now); return d != null && vanVandaag(d, now) ? [{ ...e, d }] : []; }),
  };
}

// og:image van een artikel (alleen als de feed zelf geen foto had). Leest alleen de <head>, 3 dagen in KV.
async function runOg(j: Job, t0: number, kv?: KVNamespace): Promise<Res> {
  if (!externeUrl(j.url)) throw new Error("geweigerde externe URL");
  const key = `og:${normLink(j.url)}`.slice(0, 500);
  const c = await kv?.get(key).catch(() => null);
  if (c != null) return { url: j.url, ok: true, status: 200, ms: Date.now() - t0, text: c };
  const r = await externeFetch(j.url, { headers: { "User-Agent": UA, Accept: "text/html" }, signal: AbortSignal.timeout(8000), redirect: "follow" });
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
  const kvWrites = kv && (r.ok || r.status === 404 || r.status === 403) ? 1 : 0;
  if (kvWrites) await kv!.put(key, img, { expirationTtl: 3 * 86400 }).catch(() => {});
  return { url: j.url, ok: r.ok, status: r.status, ms: Date.now() - t0, text: img, kvWrites, ...(r.ok ? {} : { err: `HTTP ${r.status}` }) };
}

// "Lees verder": de artikeltekst zelf (alinea's, zonder AI). Browser-UA (DPG e.d. weigeren bots), max 900 kB lezen.
async function runArt(j: Job, t0: number): Promise<Res> {
  const r = await externeFetch(j.url, { headers: { "User-Agent": BR_UA, Accept: "text/html,application/xhtml+xml", "Accept-Language": "nl-NL,nl;q=0.9,en;q=0.8" }, signal: AbortSignal.timeout(10000), redirect: "follow" });
  if (!r.ok || !r.body || !/html/i.test(r.headers.get("content-type") || "html")) {
    r.body?.cancel().catch(() => {});
    return { url: j.url, ok: false, status: r.status, err: `HTTP ${r.status}`, ms: Date.now() - t0, json: [] };
  }
  const rd = r.body.getReader(), dec = new TextDecoder();
  let html = "";
  while (html.length < 900000) {
    const { done, value } = await rd.read();
    if (done) break;
    html += dec.decode(value, { stream: true });
  }
  rd.cancel().catch(() => {});
  return { url: j.url, ok: true, status: r.status, ms: Date.now() - t0, json: artikelTekst(html) };
}

// Terugval voor sites die Cloudflare weigeren (DPG: AD/NU/RTL/Volkskrant/Trouw/Tweakers): r.jina.ai (Reader) leest de pagina.
async function runArtJ(j: Job, t0: number): Promise<Res> {
  if (!externeUrl(j.url)) throw new Error("geweigerde externe URL");
  const r = await fetch(`https://r.jina.ai/${j.url}`, { headers: { Accept: "text/plain", "X-Return-Format": "markdown", "X-Timeout": "15" }, signal: AbortSignal.timeout(25000) });
  if (!r.ok) { r.body?.cancel().catch(() => {}); return { url: j.url, ok: false, status: r.status, err: `jina HTTP ${r.status}`, ms: Date.now() - t0, json: [] }; }
  const md = (await r.text()).slice(0, 400000);
  return { url: j.url, ok: true, status: r.status, ms: Date.now() - t0, via: "jina", json: jinaTekst(md) };
}

// X: fxtwitter -> syndication. Tekstposts als entries (bronstats + politiek), video's van vandaag als filmpjes.
async function runX(j: Job, _since: number, t0: number): Promise<Res> {
  const user = xUser(j.url);
  if (!user) throw new Error("onbekend X-account");
  const { posts, via, err } = await xPosts(user);
  const now = Date.now();
  const entries = posts.filter((p) => !p.mp4).map(xEntry); // tekst/foto-posts naar het nieuws, video's naar Filmpjes
  const videos = posts.filter((p) => p.mp4 && vanVandaag(p.t, now)).slice(0, j.max ?? 3).map((p) => xVideo(p, j.label || user, hhmm));
  return {
    url: j.url, ok: true, status: 200, ms: Date.now() - t0, via, ...(err ? { err } : {}), total: entries.length, videos,
    newest: entries.reduce<number | null>((m, e) => (e.d && e.d <= now && (m == null || e.d > m) ? e.d : m), null),
    entries: j.alleenVideo ? [] : entries.flatMap((e) => { const d = publicatieTijd(e.d, now); return d != null && vanVandaag(d, now) ? [{ ...e, d }] : []; }),
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
let redlibN = 0;
async function viaRedlib(url: string): Promise<Response | null> {
  const path = redlibPath(url); if (!path) return null;
  const start = new Date().getUTCHours() + redlibN++;
  for (let k = 0; k < 2; k++) {
    const host = REDLIB[(start + k) % REDLIB.length];
    try {
      const r = await get(`https://${host}${path}`, 10000, UA);
      if (!r.ok) continue;
      const atom = redlibToAtom(await r.text(), host);
      if (atom) return new Response(atom, { status: 200, headers: { "x-via": `redlib:${host}` } });
    } catch { /* volgende instance */ }
  }
  return null;
}

async function runJob(j: Job, since: number, kv?: KVNamespace): Promise<Res> {
  const t0 = Date.now();
  let status = 0;
  try {
    if (j.kind === "insta") return await runInsta(j, since, t0, kv);
    if (j.kind === "og") return await runOg(j, t0, kv);
    if (j.kind === "art") return await runArt(j, t0);
    if (j.kind === "artj") return await runArtJ(j, t0);
    if (j.kind === "x") return await runX(j, since, t0);
    // news.ycombinator.com/rss geeft 419 aan Cloudflare-IP's: dezelfde HN-lijst via hnrss.org (werkt wel)
    const u = HN_RSS.test(j.url) ? "https://hnrss.org/best" : j.url;
    // Reddit: RSS met een feedlezer-UA (Feedly) wordt wél doorgelaten; bot/browser-UA krijgt 429/403 vanaf Cloudflare
    const ua1 = j.kind === "reddit" ? FEED_UA : UA;
    let r = await get(u, 15000, ua1).catch(async () => { await sleep(1500); return get(u, 20000, ua1); }); // 1x opnieuw bij time-out/netwerkfout
    // 403/429: nog één keer rustig; Reddit via old.reddit, anderen met een gewone browser-UA
    if (r.status === 403 || r.status === 429) {
      if (j.kind === "reddit") {
        await sleep(5000); r = await get(u.replace("://www.reddit.com", "://old.reddit.com"), 15000, FEED_UA);
        // daarna Redlib: 2 instances per bron, per uur roterend; alleen een pagina met echte posts telt
        if (!r.ok) { const rl = await viaRedlib(u); if (rl) r = rl; }
      }
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
      const now = Date.now();
      base.total = all.length;
      base.newest = all.reduce<number | null>((m, e) => (e.d && e.d <= now && (m == null || e.d > m) ? e.d : m), null);
      base.entries = all.flatMap((e) => { const d = publicatieTijd(e.d, now); return d != null && vanVandaag(d, now) ? [{ ...e, d }] : []; });
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
// ---------------------------------------------------------------- runner-DO
const NIET_ALS_NIEUWS = new Set(["burgernet", "gemeenteraadhaarlem"]);
const BEKENDMAKING_HINTS = /raadsbesluit|collegebesluit|verordening|verkeersbesluit|omgevingsplan|bestemmingsplan|apv|referendum|parkeer|evenement|sluiting|aanwijzing|exploitatie/i;
const NEWS_CATS = ["nl", "tech", "haarlem", "showbizz", "politiek", "voetbal", "f1", "auto"];

type State ={ llm?: LlmState; okAt?: Record<string, string>; kortAt?: number; datum: string; /** UTC-dag van de neuronenteller (Cloudflare reset 00:00 UTC) */ neuronDag?: string; neurons: number; calls: number; inTok?: number; outTok?: number; geschat?: number; foutN?: number; sums: Record<string, Sum & { at: number }>; links: Record<string, string>; hashes?: Record<string, string>; kortHash?: string; kort?: string; weerHash?: string; weerTxt?: string; runs: number;
  /** artikeltekst per link (normLink); [] = niets bruikbaars/geweigerd */ art?: Record<string, string[]>;
  /** al via r.jina.ai geprobeerd */ artJ?: Record<string, 1>;
  /** uitgebreide uitleg per bericht (sleutel = normLink van de eerste bron) */ diep?: Record<string, Diep & { at: number }> };

export class Runner extends DurableObject<Env> {
  async fetch(req: Request): Promise<Response> {
    const u = new URL(req.url);
    const force = u.searchParams.get("force") === "1";
    // Reserveer vóór de run; gelijktijdige force-verzoeken mogen niet door de limiet glippen.
    const toegestaan = await this.ctx.blockConcurrencyWhile(async () => {
      const laatst = await this.ctx.storage.get<number>("laatsteRun");
      const nu = Date.now();
      if (force && laatst !== undefined && nu - laatst < 10 * 60e3) return false;
      await this.ctx.storage.put("laatsteRun", nu);
      return true;
    });
    // geweigerd verzoek is geen mislukte run: telt niet mee in de faalreeks
    if (!toegestaan) return Response.json({ ok: false, err: "Laatste run minder dan 10 minuten geleden" }, { status: 429 });
    return bewaakteRun(() => this.run(force), this.ctx.storage, this.env.NIEUWS);
  }

  async alarm() {
    const env = this.env, A = ams(), U = utcDag(), BUDGET = +(env.BUDGET || 9000) / neuronFactor(env.NEURON_FACTOR);
    const k: any = (await this.ctx.storage.get("vooraf")) || { uur: A.h, n: 0 };
    if (k.uur !== A.h || k.n >= MAX_ALARMS_PER_UUR) return;
    // eerlijk deel per run van wat er tot 85% nog over is na de nieuwsreserve, x1.5 (begin van de dag inhalen)
    const st: any = await env.NIEUWS.get("state", "json").catch(() => null);
    const vidN = +((await env.NIEUWS.get(`vid-neurons:${U}`).catch(() => null)) || 0) || 0;
    const used = nieuwsNeuronen(st, U) + vidN;
    const runsLeft = Math.max(1, 23 - A.h + 1);
    const vrij = 0.85 * BUDGET - used - Math.max(0, 23 - A.h) * 260;
    const perAlarm = Math.max(0, Math.min(1200, (vrij / runsLeft) * 1.5));
    let r: any = { overgeslagen: "geen budget", vrij: Math.round(vrij) };
    if (perAlarm >= 40) {
      try { r = await vooraf(env, perAlarm); } catch (e: any) { r = { fout: String(e?.message || e).slice(0, 200) }; }
    }
    k.n++; k.laatst = { ...r, perAlarm: Math.round(perAlarm), used: Math.round(used), at: new Date().toISOString() };
    await this.ctx.storage.put("vooraf", k);
    await this.env.NIEUWS.put("vooraf-log", JSON.stringify(k.laatst), { expirationTtl: 2 * 86400 }).catch((e) => console.error("KV-schrijffout vooraf-log", e));
    console.log("vooraf", JSON.stringify(k.laatst));
    if (r.nogTeDoen > 0 && r.stop !== "dagbudget" && r.stop !== "run-budget" && k.n < MAX_ALARMS_PER_UUR) await this.ctx.storage.setAlarm(Date.now() + 5 * 60e3);
  }

  async run(force: boolean) {
    const env = this.env, T0 = Date.now(), now = Date.now(), A = ams(now), U = utcDag(now), since = midnight(now);
    // BUDGET / NEURON_FACTOR: de echte Cloudflare-teller kan hoger staan dan onze schatting (docs/ai-budget.md)
    const model = env.MODEL, CAP = +(env.CAP || 40), FACTOR = neuronFactor(env.NEURON_FACTOR), BUDGET = +(env.BUDGET || 9000) / FACTOR;
    const site = env.SITE.replace(/\/$/, "");
    const [bronnenR, staticR, stateRaw] = await Promise.all([
      fetch(`${site}/bronnen.json?t=${now}`, { headers: { "User-Agent": UA } }),
      fetch(`${site}/data.json?statisch=1&t=${now}`, { headers: { "User-Agent": UA } }),
      env.NIEUWS.get("state", "json") as Promise<State | null>,
    ]);
    const bronnen: any = await bronnenR.json();
    const stat: any = staticR.ok ? await staticR.json().catch(() => null) : null;
    // cache per Amsterdamse dag, neuronenteller per UTC-dag: de teller loopt door over de Amsterdamse datumgrens
    let st: State = stateRaw && stateRaw.datum === A.iso ? stateRaw : { datum: A.iso, neurons: stateRaw?.neurons || 0, calls: stateRaw?.calls || 0, inTok: stateRaw?.inTok, outTok: stateRaw?.outTok, geschat: stateRaw?.geschat, foutN: stateRaw?.foutN, neuronDag: stateRaw?.neuronDag ?? stateRaw?.datum, sums: stateRaw?.sums || {}, links: {}, hashes: stateRaw?.hashes || {}, runs: 0, okAt: stateRaw?.okAt || {} };
    zetDagTeller(st, U);
    st.llm ||= stateRaw?.llm || {};
    st.okAt ||= {};
    st.hashes ||= {};
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
        const max = s.feeds.find((f: any) => f.url === url)?.max ?? (g.id === "politiek" ? 2 : undefined);
        add({ url, kind: sub ? "reddit" : igUser(url) ? "insta" : xUser(url) ? "x" : "feed", sub, label: s.naam.replace(/^Instagram\s+|\s*\(Kittygram\)$/g, ""), ...(max != null ? { max } : {}) });
      }
    }
    for (const [naam, cid] of Object.entries(YT_NIEUWS)) add({ url: ytUrl(cid), kind: "feed", label: naam });
    for (const sub of REDDIT_SUBS) add({ url: redditUrl(sub), kind: "reddit", sub });
    for (const [u, naam] of Object.entries(X_VIDEO)) add({ url: `https://x.com/${u}`, kind: "x", label: naam, alleenVideo: true });
    // reddit-URL uit bronnen.json kan ?t=day zonder sub-label zijn: label alsnog zetten
    for (const j of jobs.values()) if (j.kind === "reddit") j.sub ||= /reddit\.com\/r\/([^/]+)/.exec(j.url)?.[1];
    add({ url: DUMPERT_URL, kind: "dumpert" });
    add({ url: BR_URL, kind: "json" }); add({ url: OM_URL, kind: "json" });
    add({ url: KNMI_VERW, kind: "text" });

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
    const buitenL = new Set<string>(); // links uit buitenlandfeeds, ook als een algemene feed ze eerder bracht
    for (const f of srcFeeds) {
      // Politiek: ook Instagram/YouTube-posts van partijen zijn 'nieuws' (eigen rubriek); andere social-bronnen niet.
      if (!NEWS_CATS.includes(f.g) || NIET_ALS_NIEUWS.has(f.s.id)) continue;
      for (const u of f.urls) {
        if (nietAlsNieuws(f.g, f.s.info || "", u)) continue; // per feed-URL: RTL Boulevard-site telt, de YouTube-feed niet
        if (/known_exploited|\.json($|\?)/.test(u)) continue;
        for (const e of [...(R.get(u)?.entries || [])].sort((a, b) => (b.d || 0) - (a.d || 0)).slice(0, f.s.feeds.find((feed: any) => feed.url === u)?.max)) {
          if (!e.t || !e.l) continue;
          if (f.s.id === "officielebekendmakingen" && !BEKENDMAKING_HINTS.test(e.t + " " + e.s)) continue;
          const k = normLink(e.l);
          if (/buitenland/i.test(u)) buitenL.add(k);
          if (seenL.has(k)) continue;
          seenL.add(k);
          cands.push({ cat: f.g, site: f.s.naam, href: e.l, t: e.t, s: e.s, d: e.d!, img: e.img });
        }
      }
    }
    let clusters = cluster(cands);
    // Een politieke post over hetzelfde verhaal hoort bij dat nieuwsbericht (rubriek van het nieuws, partij als extra bron)
    for (const k of clusters) {
      if (!k.c.some((c) => ["f1", "voetbal", "auto"].includes(c.cat))) k.cat = k.c.find((c) => c.cat !== "politiek")?.cat || "politiek";
      herindeelSport(k);
      herindeelShow(k);
    }

    // ---- wat de routine (08:00) al heeft: niet opnieuw samenvatten
    const statToday = stat && typeof stat.gegenereerd === "string" && ams(Date.parse(stat.gegenereerd)).iso === A.iso;
    const statItems: any[] = statToday ? stat.items || [] : [];
    for (const i of statItems) {
      i.cat = sportCat({ cat: i.cat, kop: i.kop || "", hrefs: (i.bronnen || []).map((b: any) => b.href || "") }) || i.cat;
      i.cat = showCat({ cat: i.cat, items: (i.bronnen || []).map((b: any) => ({ href: b.href || "" })), kop: `${i.kop || ""} ${i.ai || ""}` }) || i.cat;
    }
    const statLinks = new Set(statItems.flatMap((i: any) => (i.bronnen || []).map((b: any) => normLink(b.href || ""))));
    const statTok = statItems.map((i: any) => toks(`${i.kop} ${i.ai}`));
    const covered = (k: Cluster) => k.c.some((c) => statLinks.has(normLink(c.href))) || statTok.some((t) => { const { n, j } = sim(k.tok, t); return n >= 4 && j >= 0.25; });
    const nCovered = clusters.filter(covered).length;
    clusters = clusters.filter((k) => !covered(k));

    // ---- samenvattingen: eerst per link, daarna per titel en rubriek
    const sumOf = (k: Cluster) => {
      for (const c of k.c) { const id = st.links[normLink(c.href)]; if (id && st.sums[id]) return st.sums[id]; }
      return vindClusterSum(st.hashes!, st.sums, k.c[0].t, k.cat, now);
    };
    const usage: Usage = { neurons: 0, calls: 0, fails: 0, inTok: 0, outTok: 0, llm: { sleutel: env.GROQ_API_KEY, mistralSleutel: env.MISTRAL_API_KEY, mistralMaandTokens: env.MISTRAL_MAAND_TOKENS, state: st.llm } };
    // Alleen-politiek (losse partijposts) nooit door de AI: die tonen we zoals de partij ze schrijft.
    const todo = clusters.filter((k) => !sumOf(k) && k.cat !== "politiek");
    // ---- AI-budget in trappen (gratis = 10.000 neuronen/dag, BUDGET = eigen plafond daaronder)
    //  <70%: hoofdmodel voor alles · 70–90%: klein model, minder berichten · 90–100%: klein model, alleen NL/Haarlem · daarna: geen AI.
    // Per run hooguit 2x het eerlijke deel van wat er nog over is, zodat ook de late uren samenvattingen krijgen.
    const SMALL = env.SMALL_MODEL || "@cf/meta/llama-3.2-1b-instruct";
    // video-samenvattingen op verzoek (functions/samenvatting.ts) tellen mee in hetzelfde dagbudget
    const vidN = +((await env.NIEUWS.get(`vid-neurons:${U}`).catch(() => null)) || 0) || 0;
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
    const capN = tier0 === 1 ? CAP : tier0 === 2 ? Math.min(CAP, 15) : tier0 === 3 ? 8 : 0;
    const pick = kiesVoorAI(byCat, tier0, capN);
    // quotaOut = alleen echt op: eigen budget bereikt of een echte dagquota-fout (KV-vlag ai-quota:<UTC-dag>). Een tijdelijke fout (429/rate-limit) stopt alleen de rest van deze run.
    const quotaBekend = !!(await env.NIEUWS.get(quotaSleutel(U)).catch(() => null));
    let quotaOut = quotaBekend || st.neurons + vidN >= BUDGET, quotaReden = quotaBekend ? "dagquota" : quotaOut ? "budget" : "", tijdelijk = 0, quotaKvWrites = 0;
    const aiFoutAf = async (e: any) => {
      const soort = aiFout(e);
      if (soort === "dagquota") {
        quotaOut = true; quotaReden = "dagquota";
        if (!quotaBekend && !quotaKvWrites) { quotaKvWrites++; await env.NIEUWS.put(quotaSleutel(U), "1", { expirationTtl: 2 * 86400 }).catch((x) => console.error("KV-schrijffout ai-quota", x)); }
      } else if (soort === "tijdelijk") tijdelijk++;
    };
    // Echte Cloudflare-dagquota die Groq opving: toch quotaOut + KV-vlag, en Cloudflare wordt overgeslagen.
    const cfStand = async () => { if (usage.llm!.cloudflareFout) await aiFoutAf(usage.llm!.cloudflareFout); };
    if (quotaOut) usage.llm!.cloudflare = false;
    const modelNu = () => { const m = tier() === 1 ? model : SMALL; modelsUsed.add(m); return m; };
    const toIn = (k: Cluster, id: number): In => {
      const cs = k.c.slice(0, 4);
      return { id, cat: k.cat, bronnen: [...new Set(cs.map((c) => c.site))], titels: [...new Set(cs.map((c) => c.t))].slice(0, 3), tekst: cs.map((c) => c.s).join(" // ").slice(0, 900) };
    };
    const groups: Cluster[][] = [];
    for (let i = 0; i < pick.length; i += 5) groups.push(pick.slice(i, i + 5));
    const doGroup = async (g: Cluster[]) => {
      if (tijdelijk) return;
      // Cloudflare op of eigen budget bereikt: met Groq-sleutel gaan de samenvattingen via Groq door (kost geen neuronen).
      if (quotaOut || used() >= BUDGET) { quotaOut = true; quotaReden ||= "budget"; usage.llm!.cloudflare = false; if (!env.GROQ_API_KEY) return; }
      if (usage.neurons >= runBudget) { runCapped = true; usage.llm!.cloudflare = false; if (!env.GROQ_API_KEY) return; }
      try {
        const res = await summarize(env.AI, modelNu(), g.map((k, i) => toIn(k, i + 1)), usage);
        g.forEach((k, i) => {
          const s = res.get(i + 1);
          if (!s) return;
          const id = k.key;
          st.sums[id] = { ...s, at: now };
          for (const c of k.c) st.links[normLink(c.href)] = id;
          const hash = clusterHash(k.c[0].t, k.cat);
          if (hash) st.hashes![hash] = id;
        });
      } catch (e: any) {
        usage.fails++;
        await aiFoutAf(e);
      }
      await cfStand();
    };
    for (const groep of groups) await doGroup(groep);

    // ---- items opbouwen
    const firstSentence = (s: string) => (s.match(/^.{20,240}?[.!?](\s|$)/)?.[0] || s.slice(0, 200)).trim();
    const noAI = quotaOut || runCapped || tijdelijk > 0 || !env.AI;
    const politiekLos = clusters.filter((k) => k.cat === "politiek").sort((a, b) => Math.max(...b.c.map((c) => c.d)) - Math.max(...a.c.map((c) => c.d))).slice(0, 40);
    const shown = clusters.filter((k) => sumOf(k) || (k.cat === "politiek" ? politiekLos.includes(k) : noAI && extractief(k.c[0], isNL(k))));
    // ---- foto's: uit de feeds; ontbreekt die bij een bron, dan og:image van het artikel (gecachet in KV)
    const ogLinks = begrensOg(shown.flatMap((k) => k.c.filter((c) => !c.img && !/instagram\.com|youtube\.com|youtu\.be|reddit\.com|x\.com|twitter\.com/.test(c.href)).slice(0, 3).map((c) => c.href).filter((h) => externeUrl(h) !== null)));
    let kvWritesOg = 0;
    const og = new Map<string, string>();
    const ogB: Job[][] = [];
    for (let i = 0; i < ogLinks.length; i += 30) ogB.push(ogLinks.slice(i, i + 30).map((url) => ({ url, kind: "og" as const })));
    try {
      const rs = (await Promise.all(ogB.map(async (b, i) => (await env.FETCHER.get(env.FETCHER.idFromName(`og${i}`)).fetch("https://do/f", { method: "POST", body: JSON.stringify({ jobs: b, since }) })).json() as Promise<Res[]>))).flat();
      kvWritesOg += rs.reduce((n, r) => n + (r.kvWrites || 0), 0);
      for (const r of rs) if (r?.text) og.set(r.url, r.text);
    } catch { /* zonder og-foto's verder */ }
    const items: any[] = [];
    for (const k of shown) {
      const s = sumOf(k);
      const buitenland = k.cat === "nl" && isBuitenland({ kop: k.c.map((c) => c.t).join(" "), ai: s?.ai, bronnen: k.c.map((c) => ({ href: c.href, buitenFeed: buitenL.has(normLink(c.href)) })) });
      const laatst = nieuwsteTijd(k.c);
      if (buitenland) k.cat = "buitenland";
      const bron = [...new Map(k.c.map((c) => [c.site, { site: c.site, href: c.href }])).values()].slice(0, 6);
      const beelden = uniekeBeelden(k.c.flatMap((c) => [c.img, og.get(c.href)]));
      const bb = beelden.length ? { beelden } : {};
      if (s) items.push({ cat: k.cat, kop: s.kop, ai: s.ai, samenvatting: s.samenvatting, punten: s.punten, tijd: hhmm(laatst), bronnen: bron, ...bb, t: laatst, _t: laatst, uur: true });
      else {
        const desc = (k.c[0].s || k.c[0].t.replace(/\s*(…|\.\.\.)$/, "")).replace(/\s+/g, " ").trim();
        // kop = eerste zin van de post (partijposts hebben geen aparte titel); korte tekst = wat daarna komt, nooit twee keer hetzelfde
        const zin = desc.match(/^.{15,120}?[.!?](\s|$)/)?.[0]?.trim();
        const knip = desc.length > 120 ? desc.slice(0, 117).replace(/\s+\S*$/, "") : desc;
        const kop = zin || (knip.length < desc.length ? knip + "…" : knip);
        const rest = desc.slice((zin || knip).length).replace(/^[\s.!?,:;…-]+/, "");
        const ai = rest ? firstSentence(rest) : "";
        if (k.cat === "politiek") items.push({ cat: k.cat, kop, ai, samenvatting: rest.slice(0, 700), punten: [], tijd: hhmm(laatst), bronnen: bron, ...bb, t: laatst, _t: laatst, uur: true, ruw: true });
        else items.push({ cat: k.cat, ...extractief(k.c[0], isNL(k))!, punten: [], tijd: hhmm(laatst), bronnen: bron, ...bb, t: laatst, _t: laatst, uur: true, ruw: true }); // extractief, alle rubrieken; Engels met "(Engels)"
      }
    }
    items.sort((a, b) => b._t - a._t);
    for (const i of items) delete i._t;
    for (const i of items) if (i.cat === "nl" && isBuitenland({ kop: i.kop, ai: i.ai, bronnen: i.bronnen.map((b: any) => ({ ...b, buitenFeed: buitenL.has(normLink(b.href)) })) })) i.cat = "buitenland";

    // ---- "Lees verder": artikeltekst ophalen (zonder AI) en, zolang het dagbudget het toelaat, een langere uitleg
    // + kernpunten per bron (Workers AI). Ook voor de berichten van de routine (08:00). Resultaat in KV "meer"
    // (1 schrijfactie per run); de site haalt het per bericht op via /meer?k=<sleutel>.
    const SOCIAAL = /instagram\.com|youtube\.com|youtu\.be|reddit\.com|(^|\.)x\.com|twitter\.com|officielebekendmakingen|openraadsinformatie/;
    st.art ||= {}; st.diep ||= {};
    type MC = { key: string; kop: string; kort: string; bronnen: { site: string; href: string }[]; t: number; item?: any };
    const mc: MC[] = [];
    const mGezien = new Set<string>();
    const pushM = (m: MC) => { if (m.key && !mGezien.has(m.key)) { mGezien.add(m.key); mc.push(m); } };
    for (const i of items) pushM({ key: normLink(i.bronnen?.[0]?.href || ""), kop: i.kop, kort: [i.ai, i.samenvatting].filter(Boolean).join(" "), bronnen: i.bronnen || [], t: Date.parse(`${A.iso}T${i.tijd || "00:00"}:00`) || 0, item: i });
    for (const i of statItems) pushM({ key: normLink(i.bronnen?.[0]?.href || ""), kop: i.kop, kort: [i.ai, i.samenvatting].filter(Boolean).join(" "), bronnen: i.bronnen || [], t: 0 });
    const hp = (h: string) => { try { const x = new URL(h); return /^https?:$/.test(x.protocol) ? x.hostname + x.pathname : ""; } catch { return ""; } };
    const artLinks = (m: MC) => m.bronnen.filter((b) => { const x = hp(b.href || ""); return externeUrl(b.href) !== null && x && !SOCIAAL.test(x); }).slice(0, 3);
    // nieuwste/meeste bronnen eerst; max 120 nieuwe artikelen per run (4 Fetcher-DO's x 30)
    const mOrde = [...mc].sort((a, b) => b.bronnen.length - a.bronnen.length || b.t - a.t);
    const nodig = [...new Set(mOrde.flatMap((m) => artLinks(m).map((b) => b.href)).filter((h) => !(normLink(h) in st.art!)))].slice(0, 120);
    const artB: Job[][] = [];
    for (let i = 0; i < nodig.length; i += 30) artB.push(nodig.slice(i, i + 30).map((url) => ({ url, kind: "art" as const })));
    let artOk = 0, artFout = 0, artJina = 0;
    const artErr: Record<string, string> = {};
    try {
      const rs = (await Promise.all(artB.map(async (b, i) => (await env.FETCHER.get(env.FETCHER.idFromName(`art${i}`)).fetch("https://do/f", { method: "POST", body: JSON.stringify({ jobs: b, since }) })).json() as Promise<Res[]>))).flat();
      const mis: string[] = [];
      for (const r of rs) {
        if (!r) continue;
        const al: string[] = Array.isArray(r.json) ? r.json : [];
        st.art[normLink(r.url)] = al;
        if (al.join(" ").length >= 300) artOk++;
        else { mis.push(r.url); const h = hp(r.url).split("/")[0].replace(/^www\./, ""); artErr[h] = r.ok ? "geen tekst (betaalmuur?)" : r.err || `HTTP ${r.status}`; }
      }
      artFout = rs.length - artOk;
    } catch (e: any) { artErr._run = String(e?.message || e).slice(0, 80); }
    // tweede poging via r.jina.ai voor links zonder tekst (geweigerd/betaalmuur), elk maar één keer;
    // max 15 per run (gratis limiet 20/min), nieuwste/meeste bronnen eerst
    st.artJ ||= {};
    const jLinks = [...new Set(mOrde.flatMap((m) => artLinks(m).map((b) => b.href)).filter((h) => { const l = normLink(h); return l in st.art! && st.art![l].join(" ").length < 300 && !st.artJ![l]; }))].slice(0, 15);
    if (jLinks.length) {
      try {
        const rj = (await (await env.FETCHER.get(env.FETCHER.idFromName("artj")).fetch("https://do/f", { method: "POST", body: JSON.stringify({ jobs: jLinks.map((url) => ({ url, kind: "artj" })), since }) })).json()) as Res[];
        for (const r of rj) {
          if (!r) continue;
          const l = normLink(r.url);
          st.artJ[l] = 1;
          const al: string[] = Array.isArray(r.json) ? r.json : [];
          if (al.join(" ").length >= 300) { st.art[l] = al; artJina++; }
          else { const h = hp(r.url).split("/")[0].replace(/^www\./, ""); artErr[`jina:${h}`] = r.ok ? "geen tekst" : r.err || `HTTP ${r.status}`; }
        }
      } catch (e: any) { artErr._jina = String(e?.message || e).slice(0, 80); }
    }
    const artVan = (m: MC) => artLinks(m).map((b) => ({ ...b, al: st.art![normLink(b.href)] || [] })).filter((b) => b.al.join(" ").length >= 300);
    // AI-uitleg: alleen in trap 1 en onder 65% van het dagbudget (nieuws en video-samenvattingen gaan voor),
    // per run een eerlijk deel van wat er tot die grens over is (min 120, max 700 neuronen).
    const diepGrens = 0.65 * BUDGET;
    const diepRun = Math.max(120, Math.min(700, ((diepGrens - used()) / runsLeft) * 2));
    const diepStart = usage.neurons;
    let diepNieuw = 0, diepStop = "";
    const diepTodo = mOrde.filter((m) => !st.diep![m.key] && artVan(m).length);
    const dGroepen: MC[][] = [];
    for (let i = 0; i < diepTodo.length; i += 2) dGroepen.push(diepTodo.slice(i, i + 2));
    const doDiep = async (g: MC[]) => {
      // Met Groq-sleutel gaat de uitleg via Groq (geen neuronen), ook als Cloudflare op is.
      if (tijdelijk || !env.GROQ_API_KEY && (!env.AI || quotaOut || tier() !== 1 || used() >= diepGrens)) { diepStop ||= "dagbudget"; return; }
      if (!env.GROQ_API_KEY && usage.neurons - diepStart >= diepRun) { diepStop ||= "run-budget"; return; }
      try {
        usage.llm!.groqEerst = true;
        const res = await verdiep(env.AI, model, g.map((m, i) => {
          const bs = artVan(m);
          const per = Math.floor(3600 / bs.length);
          return { id: i + 1, kop: m.kop, kort: m.kort.slice(0, 500), bronnen: bs.map((b) => ({ site: b.site, tekst: b.al.join(" ").slice(0, Math.min(2000, per)) })) };
        }), usage);
        modelsUsed.add(model);
        g.forEach((m, i) => { const d = res.get(i + 1); if (d) { st.diep![m.key] = { ...d, at: now }; diepNieuw++; } });
      } catch (e: any) {
        usage.fails++;
        await aiFoutAf(e);
      }
      await cfStand();
    };
    for (const groep of dGroepen) await doDiep(groep);
    usage.llm!.groqEerst = false;
    const diepN = usage.neurons - diepStart;
    // "meer" per bericht: AI-uitleg + kernpunten per bron, anders (zonder AI) het begin van het artikel zelf.
    const meer: Record<string, any> = {};
    for (const m of mc) {
      const d = st.diep[m.key];
      const art = artVan(m);
      const href = (site: string) => m.bronnen.find((b) => b.site === site)?.href || "";
      const uittreksel = art.slice(0, 2).map((b) => {
        const al: string[] = [];
        for (const p of b.al) { if (al.length && al.join(" ").length + p.length > 1100) break; al.push(p); }
        return { site: b.site, href: b.href, alineas: al };
      });
      if (d) meer[m.key] = { uitleg: d.uitleg, perBron: d.perBron.map((b) => ({ ...b, href: href(b.site) })) };
      else if (uittreksel.length) meer[m.key] = { uittreksel };
      if (meer[m.key] && m.item) m.item.meer = m.key;
    }
    const meerKeys = Object.keys(meer);
    // artikeltekst niet langer bewaren dan nodig (state blijft klein): alleen voor berichten die nu getoond worden
    const nuLinks = new Set(mc.flatMap((m) => m.bronnen.map((b) => normLink(b.href))));
    for (const l of Object.keys(st.art)) if (!nuLinks.has(l)) { delete st.art[l]; delete st.artJ[l]; }
    for (const k of Object.keys(st.diep)) if (!mGezien.has(k) && now - st.diep[k].at > 6 * 3600e3) delete st.diep[k];

    // ---- In het kort (één keer per run, alleen als de berichten veranderd zijn)
    const lijst = [...items.filter((i) => !i.ruw), ...statItems].slice(0, 70);
    const order = ["nl", "buitenland", "voetbal", "f1", "auto", "tech", "haarlem", "showbizz"];
    const lines = order.flatMap((c) => lijst.filter((i) => i.cat === c).slice(0, c === "nl" ? 22 : 10)).map((i) => `${i.cat}: ${i.kop} — ${i.ai}`);
    const kh = await hash(lines.join("\n"));
    let kort = st.kort || "";
    // trap 1: elke keer als het nieuws verandert; trap 2: klein model, hooguit elke 3 uur; trap 3+: niet meer
    const kortMag = tier() === 1 || (tier() === 2 && now - (st.kortAt || 0) > 3 * 3600e3);
    if ((kh !== st.kortHash || force) && lines.length && !quotaOut && kortMag) {
      try { const k = await inHetKort(env.AI, modelNu(), lines, usage); if (k.length > 40) st.kortAt = now; if (k.length > 40) { kort = k; st.kort = k; st.kortHash = kh; } } catch (e) { usage.fails++; await aiFoutAf(e); }
      await cfStand();
    }

    // Taboverzichten volgen de berichtsamenvattingen en gebruiken alleen resterend budget.
    const tabItems = [...items, ...statItems.map(herindeel)];
    const tabSam: Record<string, any> = {};
    let tabWrites = 0;
    const tabs = [...new Set(tabItems.map((i) => i.cat as string))];
    for (const tab of tabs) {
      const berichten = tabItems.filter((i) => i.cat === tab);
      if (!berichten.length) continue;
      const route = tabAiRoute(tier(), quotaOut || runCapped || usage.neurons >= runBudget, !!tijdelijk, !!env.AI, !!(env.GROQ_API_KEY || env.MISTRAL_API_KEY));
      if (route === "extern") usage.llm!.cloudflare = false;
      const maak = route !== "geen" ? async () => {
        const voor = Object.fromEntries(Object.entries(usage.aanbieders || {}).map(([k, v]) => [k, v.inTok + v.outTok]));
        try {
          const tekst = await tabTekst(env.AI, modelNu(), berichten, usage);
          const bron = Object.keys(usage.aanbieders || {}).find((k) => (usage.aanbieders![k].inTok + usage.aanbieders![k].outTok) > (voor[k] || 0)) || "ai";
          return { tekst, bron };
        } catch (e) { usage.fails++; await aiFoutAf(e); throw e; }
        finally { await cfStand(); }
      } : undefined;
      const resultaat = await maakTabSam(env.NIEUWS, tab, berichten, now, maak);
      tabSam[tab] = resultaat.sam;
      if (resultaat.geschreven) tabWrites++;
    }

    // ---- weer
    const W = buildWeer(R.get(BR_URL)?.json, R.get(OM_URL)?.json, R.get(KNMI_VERW)?.text || null, A.iso, A.hhmm);
    if (W.knmiTekst) {
      const wh = await hash("nl:" + W.knmiTekst); // "nl:" = landelijke prompt; ververst een oude Haarlem-tekst eenmalig
      if (wh !== st.weerHash && !quotaOut && tier() <= 2) {
        try { const t = await simpelWeer(env.AI, modelNu(), W.knmiTekst, usage); if (t.length > 30) { st.weerTxt = t; st.weerHash = wh; } } catch (e) { usage.fails++; await aiFoutAf(e); }
        await cfStand();
      }
      if (st.weerHash === wh && st.weerTxt) W.weer.verwachting = st.weerTxt;
    }

    // ---- filmpjes + dumpert
    let dumpert = (R.get(DUMPERT_URL)?.videos || []) as (Video & { _pub: number })[];
    dumpert = dumpert.filter((v) => vanVandaag(v._pub, now)).slice(0, 25);
    const statD = new Map<string, any>((stat?.dumpert || []).map((v: any) => [v.href, v]));
    const kortAi = (s: string) => (s.length > 140 ? s.slice(0, 137).replace(/\s+\S*$/, "") + "…" : s);
    const dOut = dumpert.map(({ _score, _pub, ...v }) => ({ ...v, t: publicatieTijd(_pub, now), tijd: hhmm(publicatieTijd(_pub, now)!), ai: statD.get(v.href)?.ai || kortAi(v.ai) }));
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
    const dF = dedupVideos(fv.filter((v) => vanVandaag(v._pub, now)).map((v) => ({ ...v, _pub: publicatieTijd(v._pub, now)! })).sort((a, b) => (b._score || 0) - (a._score || 0)).map((v) => ({ ...v, soort: soortVan(v) })), dOut);
    const uniek = dF.list;
    const fOut = selecteerFilmpjes(uniek)
      .map(({ _score, _pub, ...v }: any) => { delete v._k; return { ...v, t: _pub, tijd: hhmm(_pub) }; });

    // ---- wegschrijven
    st.neurons += usage.neurons; st.calls += usage.calls;
    st.inTok = (st.inTok || 0) + usage.inTok; st.outTok = (st.outTok || 0) + usage.outTok; st.geschat = (st.geschat || 0) + (usage.geschat || 0); st.foutN = (st.foutN || 0) + (usage.foutN || 0);
    const out = {
      datum: datumNL(now), gegenereerd: new Date(now).toISOString(), dag_samenvatting: kort, tab_samenvatting: tabSam, weer: W.weer, filmpjes: fOut, dumpert: dOut, items, bronstats, meerKeys,
      meta: { kvWrites: results.reduce((n, r) => n + (r.kvWrites || 0), 0) + kvWritesOg + quotaKvWrites + tabWrites + 3, kvWritesOg, model, routine: stat?.gegenereerd || null, nieuweSamenvattingen: Object.values(st.sums).filter((s) => s.at === now).length, kandidaten: cands.length, clusters: clusters.length + nCovered, alInRoutine: nCovered, items: items.length, ruw: items.filter((i) => i.ruw).length, quotaOp: quotaOut, aiStand: ["", "normaal", "zuinig", "krap", "op"][quotaOut ? 4 : tier()], aiModellen: [...modelsUsed], runBudget: Math.round(runBudget), runVol: runCapped, dubbeleFilmpjes: dF.removed + dD.removed, dubbelVoorbeelden: [...dD.groups, ...dF.groups].slice(0, 8), metFoto: items.filter((i) => i.beelden?.length).length, ogOpgehaald: ogLinks.length, leesVerder: { berichten: mc.length, metMeer: meerKeys.length, metUitleg: meerKeys.filter((k) => meer[k].uitleg).length, nieuweUitleg: diepNieuw, uitlegStop: diepStop, uitlegRunBudget: Math.round(diepRun), neuronenUitleg: Math.round(diepN), artikelenOpgehaald: nodig.length, artikelenMetTekst: artOk, artikelenZonderTekst: artFout, viaJina: artJina, jinaGeprobeerd: jLinks.length, artikelFouten: artErr }, neuronenRun: Math.round(usage.neurons), tokensRun: { in: usage.inTok, uit: usage.outTok }, aiGeschat: usage.geschat || 0, neuronenFoutRun: Math.round(usage.foutN || 0), aiTijdelijk: tijdelijk, quotaReden: quotaReden || null, neuronFactor: FACTOR, budgetDag: U, dag: { neuronen: Math.round(st.neurons), calls: st.calls, tokensIn: st.inTok, tokensUit: st.outTok, geschat: st.geschat, neuronenFout: Math.round(st.foutN || 0) }, neuronenVandaag: Math.round(st.neurons), neuronenVideo: Math.round(vidN), aiTokens: usage.aanbieders || {}, aiCalls: usage.calls, aiFouten: usage.fails, feeds: results.length, feedsFout: results.filter((r) => !r.ok).map((r) => `${r.url} ${r.err}`), msOphalen: T1 - T0, msTotaal: Date.now() - T0 },
    };
    // oude samenvattingen (niet meer in de feeds) opruimen
    const live = new Set(clusters.map((k) => k.key));
    for (const id of Object.keys(st.sums)) if (!live.has(id) && now - st.sums[id].at >= 24 * 3600e3) { delete st.sums[id]; }
    for (const [l, id] of Object.entries(st.links)) if (!st.sums[id]) delete st.links[l];
    for (const [h, id] of Object.entries(st.hashes)) if (!st.sums[id] || now - st.sums[id].at >= 24 * 3600e3) delete st.hashes[h];
    await schrijfRun(env.NIEUWS, out, st, { datum: A.iso, gegenereerd: out.gegenereerd, items: meer }, async () => {
      // Eigen CPU/subrequest-budget voor video-samenvattingen na het nieuws.
      await this.ctx.storage.put("vooraf", { uur: A.h, n: 0 });
      await this.ctx.storage.setAlarm(Date.now() + 60e3);
    });
    return { ok: true, ...out.meta, gegenereerd: out.gegenereerd };
  }
}
async function hash(s: string) {
  const b = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

async function toegelaten(req: Request, sleutel?: string): Promise<boolean> {
  const bearer = /^Bearer ([^\s]+)$/i.exec(req.headers.get("Authorization") || "");
  if (!sleutel || !bearer) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([sleutel, bearer[1]].map(async (s) =>
    new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s)))));
  let verschil = 0;
  for (let i = 0; i < a.length; i++) verschil |= a[i] ^ b[i];
  return verschil === 0;
}

// ---------------------------------------------------------------- worker
export default {
  async scheduled(ev: ScheduledController, env: Env, _ctx: ExecutionContext) {
    const h = ams(ev.scheduledTime).h;
    if (h < 6 || h > 23) return; // cron draait in UTC; dit houdt het op 06:00–23:00 Amsterdam (zomer- en wintertijd)
    const stub = env.RUNNER.get(env.RUNNER.idFromName("runner"));
    try {
      const r = await stub.fetch("https://do/run");
      const body = await r.text();
      if (!r.ok) console.error("run mislukt", r.status, body.slice(0, 500));
      else console.log(body.slice(0, 2000));
    } catch {
      console.error("run starten mislukt");
    }
  },
  async fetch(req: Request, env: Env): Promise<Response> {
    const u = new URL(req.url);
    if (u.pathname === "/run") {
      if (!await toegelaten(req, env.RUN_KEY)) return new Response("nee", { status: 403 });
      const stub = env.RUNNER.get(env.RUNNER.idFromName("runner"));
      return stub.fetch(`https://do/run?force=${u.searchParams.get("force") || ""}`);
    }
    if (u.pathname === "/uur") {
      if (!await toegelaten(req, env.RUN_KEY)) return new Response("nee", { status: 403 });
      return new Response((await env.NIEUWS.get("uur")) || "{}", { headers: { "content-type": "application/json" } });
    }
    if (u.pathname === "/status") {
      const d: any = await env.NIEUWS.get("uur", "json");
      const vf = await env.NIEUWS.get("vooraf-log", "json").catch(() => null);
      return Response.json(d ? { gegenereerd: d.gegenereerd, ...d.meta, vooraf: vf } : { leeg: true });
    }
    return new Response("nieuwsinkort-uur", { status: 200 });
  },
};
