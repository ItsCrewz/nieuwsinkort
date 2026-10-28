// nieuwsinkort-uur: elk uur (06:00–23:00 Amsterdam) feeds ophalen, samenvatten met Workers AI en in KV zetten.
// De Pages Function /data.json voegt dit samen met de data.json van de routine.
// Free plan: de cron zelf doet bijna niets (10 ms CPU); het werk gebeurt in Durable Objects (30 s CPU per verzoek)
// en het ophalen wordt verdeeld over meerdere Fetcher-DO's (elk max 50 externe verzoeken).
import { DurableObject } from "cloudflare:workers";
import { parseFeed, type Entry } from "./parse";
import { buildWeer, BR_URL, OM_URL, KNMI_VERW, KNMI_WAARSCH } from "./weer";
import { YT_NIEUWS, ytUrl, REDDIT_SUBS, redditUrl, DUMPERT_URL, parseDumpert, parseYouTube, parseRedditVideos, type Video } from "./videos";
import { summarize, inHetKort, simpelWeer, type Usage, type In, type Sum } from "./ai";

export interface Env {
  NIEUWS: KVNamespace; AI: Ai; RUNNER: DurableObjectNamespace<Runner>; FETCHER: DurableObjectNamespace<Fetcher>;
  RUN_KEY?: string; SITE: string; MODEL: string; CAP?: string; BUDGET?: string;
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
type Job = { url: string; kind: "feed" | "json" | "text" | "dumpert" | "reddit"; label?: string; sub?: string };
type Res = { url: string; ok: boolean; status: number; err?: string; ms: number; entries?: Entry[]; newest?: number | null; total?: number; videos?: Video[]; json?: any; text?: string };

async function get(url: string, timeout = 15000): Promise<Response> {
  // SRU (overheid.nl) geeft JSON terug zodra "application/json" in Accept staat: dan alleen XML vragen
  const accept = /\/sru\?/.test(url) ? "application/xml, text/xml" : "application/rss+xml, application/atom+xml, application/xml, text/xml, application/json, text/html;q=0.8, */*;q=0.5";
  // ORI-elastic zonder query geeft willekeurige documenten: nieuwste eerst
  if (/openraadsinformatie\.nl\/.*\/_search$/.test(url)) url += "?size=50&sort=start_date:desc&_source=name,start_date,last_discussed_at,date_modified,@type";
  return fetch(url, { headers: { "User-Agent": UA, Accept: accept, "Accept-Language": "nl-NL,nl;q=0.9,en;q=0.8" }, signal: AbortSignal.timeout(timeout), redirect: "follow" });
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function runJob(j: Job, since: number): Promise<Res> {
  const t0 = Date.now();
  let status = 0;
  try {
    let r = await get(j.url).catch(async () => { await sleep(1500); return get(j.url, 20000); }); // 1x opnieuw bij time-out/netwerkfout
    if (j.kind === "reddit" && r.status === 429) { await sleep(6000); r = await get(j.url); }
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
    const pool = async () => { for (let x; (x = rest.shift()); ) out[x[1]] = await runJob(x[0], since); };
    const seq = async () => { for (let k = 0; k < reddit.length; k++) { if (k) await sleep(2500); out[reddit[k][1]] = await runJob(reddit[k][0], since); } };
    await Promise.all([seq(), ...Array.from({ length: reddit.length ? 5 : 6 }, pool)]);
    return Response.json(out);
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
const SOCIAL_INFO = /YouTube|Instagram|Reddit|^X$|Podcast/;
const NIET_ALS_NIEUWS = new Set(["burgernet", "gemeenteraadhaarlem"]);
const BEKENDMAKING_HINTS = /raadsbesluit|collegebesluit|verordening|verkeersbesluit|omgevingsplan|bestemmingsplan|apv|referendum|parkeer|evenement|sluiting|aanwijzing|exploitatie/i;
const NEWS_CATS = ["nl", "tech", "haarlem", "showbizz"];

type State = { datum: string; neurons: number; calls: number; sums: Record<string, Sum & { at: number }>; links: Record<string, string>; kortHash?: string; kort?: string; weerHash?: string; weerTxt?: string; runs: number };

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
    let st: State = stateRaw && stateRaw.datum === A.iso ? stateRaw : { datum: A.iso, neurons: 0, calls: 0, sums: {}, links: {}, runs: 0 };
    st.runs++;

    // ---- jobs
    const jobs = new Map<string, Job>();
    const add = (j: Job) => { if (!jobs.has(j.url)) jobs.set(j.url, j); };
    const srcFeeds: { key: string; g: string; s: any; urls: string[] }[] = [];
    for (const g of bronnen.groepen || []) for (const s of g.bronnen || []) {
      const urls: string[] = (s.feeds || []).map((f: any) => f.url).filter((x: string) => !/^https?:\/\/(x|twitter)\.com\//.test(x));
      if (!urls.length) continue;
      srcFeeds.push({ key: `${g.id}|${s.id}`, g: g.id, s, urls });
      for (const url of urls) {
        const sub = /reddit\.com\/r\/([^/]+)/.exec(url)?.[1];
        add({ url, kind: sub ? "reddit" : "feed", sub, label: s.naam });
      }
    }
    for (const [naam, cid] of Object.entries(YT_NIEUWS)) add({ url: ytUrl(cid), kind: "feed", label: naam });
    for (const sub of REDDIT_SUBS) add({ url: redditUrl(sub), kind: "reddit", sub });
    // reddit-URL uit bronnen.json kan ?t=day zonder sub-label zijn: label alsnog zetten
    for (const j of jobs.values()) if (j.kind === "reddit") j.sub ||= /reddit\.com\/r\/([^/]+)/.exec(j.url)?.[1];
    add({ url: DUMPERT_URL, kind: "dumpert" });
    add({ url: BR_URL, kind: "json" }); add({ url: OM_URL, kind: "json" });
    add({ url: KNMI_VERW, kind: "text" }); add({ url: KNMI_WAARSCH, kind: "text" });

    const all = [...jobs.values()];
    const reddit = all.filter((j) => j.kind === "reddit"), rest = all.filter((j) => j.kind !== "reddit");
    const batches: Job[][] = [reddit];
    for (let i = 0; i < rest.length; i += 30) batches.push(rest.slice(i, i + 30));
    const results = (await Promise.all(batches.map(async (b, i) => {
      if (!b.length) return [] as Res[];
      const stub = env.FETCHER.get(env.FETCHER.idFromName(`f${i}`));
      const r = await stub.fetch("https://do/f", { method: "POST", body: JSON.stringify({ jobs: b, since }) });
      return (await r.json()) as Res[];
    }))).flat();
    const R = new Map(results.map((r) => [r.url, r]));
    const T1 = Date.now();

    // ---- bronstats
    const bronstats: Record<string, { vandaag: number | null; laatste?: string; fout?: string }> = {};
    for (const f of srcFeeds) {
      const rs = f.urls.map((u) => R.get(u)).filter(Boolean) as Res[];
      const ok = rs.filter((r) => r.ok);
      if (!ok.length) { bronstats[f.key] = { vandaag: null, fout: rs.map((r) => r.err).filter(Boolean).join("; ").slice(0, 80) || "geen antwoord" }; continue; }
      const seen = new Set<string>();
      let newest: number | null = null;
      for (const r of ok) {
        for (const e of r.entries || []) seen.add(normLink(e.l || e.t));
        if (r.newest && (newest == null || r.newest > newest)) newest = r.newest;
      }
      const o: any = { vandaag: seen.size };
      if (newest) o.laatste = new Date(newest).toISOString();
      if (ok.length < rs.length) o.fout = `${rs.length - ok.length} van ${rs.length} feeds niet bereikbaar`;
      bronstats[f.key] = o;
    }

    // ---- nieuws-kandidaten
    const cands: Cand[] = [];
    const seenL = new Set<string>();
    for (const f of srcFeeds) {
      if (!NEWS_CATS.includes(f.g) || SOCIAL_INFO.test(f.s.info || "") || NIET_ALS_NIEUWS.has(f.s.id)) continue;
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
    const todo = clusters.filter((k) => !sumOf(k));
    // prioriteit: meer bronnen eerst, dan nieuwste; eerlijk verdeeld over rubrieken
    const byCat: Record<string, Cluster[]> = {};
    for (const k of todo.sort((a, b) => b.c.length - a.c.length || Math.max(...b.c.map((c) => c.d)) - Math.max(...a.c.map((c) => c.d)))) (byCat[k.cat] ||= []).push(k);
    const pick: Cluster[] = [];
    const ROUND = ["nl", "nl", "tech", "haarlem", "showbizz"];
    while (pick.length < CAP && Object.values(byCat).some((l) => l.length))
      for (const c of ROUND) { const x = byCat[c]?.shift(); if (x && pick.length < CAP) pick.push(x); }
    let quotaOut = st.neurons >= BUDGET;
    const toIn = (k: Cluster, id: number): In => {
      const cs = k.c.slice(0, 4);
      return { id, cat: k.cat, bronnen: [...new Set(cs.map((c) => c.site))], titels: [...new Set(cs.map((c) => c.t))].slice(0, 3), tekst: cs.map((c) => c.s).join(" // ").slice(0, 900) };
    };
    const groups: Cluster[][] = [];
    for (let i = 0; i < pick.length; i += 5) groups.push(pick.slice(i, i + 5));
    const doGroup = async (g: Cluster[]) => {
      if (quotaOut || st.neurons + usage.neurons >= BUDGET) { quotaOut = true; return; }
      try {
        const res = await summarize(env.AI, model, g.map((k, i) => toIn(k, i + 1)), usage);
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
    const items: any[] = [];
    for (const k of clusters) {
      const s = sumOf(k);
      const first = Math.min(...k.c.map((c) => c.d));
      const bron = [...new Map(k.c.map((c) => [c.site, { site: c.site, href: c.href }])).values()].slice(0, 6);
      if (s) items.push({ cat: k.cat, kop: s.kop, ai: s.ai, samenvatting: s.samenvatting, punten: s.punten, tijd: hhmm(first), bronnen: bron, _t: first, uur: true });
      else if ((quotaOut || !env.AI) && isNL(k) && k.c[0].s) {
        const desc = k.c[0].s;
        items.push({ cat: k.cat, kop: k.c[0].t.slice(0, 100), ai: firstSentence(desc), samenvatting: desc.slice(0, 700), punten: [], tijd: hhmm(first), bronnen: bron, _t: first, uur: true, ruw: true });
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
    if ((kh !== st.kortHash || force) && lines.length && !quotaOut && st.neurons + usage.neurons < BUDGET) {
      try { const k = await inHetKort(env.AI, model, lines, usage); if (k.length > 40) { kort = k; st.kort = k; st.kortHash = kh; } } catch { usage.fails++; }
    }

    // ---- weer
    const W = buildWeer(R.get(BR_URL)?.json, R.get(OM_URL)?.json, R.get(KNMI_VERW)?.text || null, R.get(KNMI_WAARSCH)?.text || null, A.iso, A.hhmm);
    if (W.knmiTekst) {
      const wh = await hash(W.knmiTekst);
      if (wh !== st.weerHash && !quotaOut && st.neurons + usage.neurons < BUDGET) {
        try { const t = await simpelWeer(env.AI, model, W.knmiTekst, usage); if (t.length > 30) { st.weerTxt = t; st.weerHash = wh; } } catch { usage.fails++; }
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
    const seenV = new Set<string>();
    const fOut = fv.sort((a, b) => (b._score || 0) - (a._score || 0)).filter((v) => !seenV.has(v.href) && seenV.add(v.href)).slice(0, 15).map(({ _score, _pub, ...v }: any) => { delete v._k; return v; });

    // ---- wegschrijven
    st.neurons += usage.neurons; st.calls += usage.calls;
    const out = {
      datum: datumNL(now), gegenereerd: new Date(now).toISOString(), dag_samenvatting: kort, weer: W.weer, filmpjes: fOut, dumpert: dOut, items, bronstats,
      meta: { model, routine: stat?.gegenereerd || null, nieuweSamenvattingen: Object.values(st.sums).filter((s) => s.at === now).length, kandidaten: cands.length, clusters: clusters.length + nCovered, alInRoutine: nCovered, items: items.length, ruw: items.filter((i) => i.ruw).length, quotaOp: quotaOut, neuronenRun: Math.round(usage.neurons), neuronenVandaag: Math.round(st.neurons), aiCalls: usage.calls, aiFouten: usage.fails, feeds: results.length, feedsFout: results.filter((r) => !r.ok).map((r) => `${r.url} ${r.err}`), msOphalen: T1 - T0, msTotaal: Date.now() - T0 },
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
