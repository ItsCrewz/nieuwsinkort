// Filmpjes en Dumpert vooraf warm maken, zodat een klik op die tabs niet op het netwerk hoeft te wachten.
// Pure keuzelogica (plan) + een kleine browser-runner. Alleen na de load-event, in idle-tijd, alles met lage
// prioriteit en hooguit 3 requests tegelijk. Geen AI, geen /samenvatting, geen /meer.
import type { Video } from "./types";

export type Speler = { kind: "youtube" | "hls" | "mp4"; src: string } | null;
export type Hulp = { playerFor: (v: Video) => Speler; viaProxy: (src: string) => string };
export type Plan = {
  thumbs: string[];
  preconnect: string[];
  hlsChunk: boolean;
  hls: string[]; // master-playlists (via de proxy, of rechtstreeks op Apple)
  mp4: string | null;
};

const THUMBS = 6;
const KIJK = 3; // zoveel items per tab telt als "eerste"
const HLS_MAX = 2;
export const MP4_BYTES = 256 * 1024;
export const GELIJK = 3;
export const NETWERK_TIMEOUT = 10000;

const uniek = <T,>(l: T[]) => [...new Set(l)];
const origin = (u: string) => {
  try {
    const x = new URL(u);
    return x.protocol === "https:" ? x.origin : "";
  } catch {
    return "";
  }
};
const httpsUrl = (u: string) => !!origin(u);

/** Apple-apparaten spelen HLS doorgaans zelf af. Zonder `video` (Home, nog geen intentie) alleen thumbs: geen chunk, playlists, segmenten of mp4. */
export function planVoorladen(filmpjes: Video[], dumpert: Video[], apple: boolean, h: Hulp, video = true): Plan {
  const n = THUMBS;
  // Dumpert-posters via onze proxy (media.dumpert.nl sluit rechtstreekse verbindingen soms en logt dan console-errors)
  const thumbs = uniek([...filmpjes.slice(0, n), ...dumpert.slice(0, n)].map((v) => v.thumb).filter(httpsUrl).map(h.viaProxy));
  if (!video) return { thumbs, preconnect: [], hlsChunk: false, hls: [], mp4: null };
  const eerste = [...filmpjes.slice(0, KIJK), ...dumpert.slice(0, KIJK)];
  const sp = eerste.map((v) => h.playerFor(v)).filter((s): s is NonNullable<Speler> => !!s);
  const hlsAll = uniek(sp.filter((s) => s.kind === "hls").map((s) => s.src));
  const mp4 = sp.find((s) => s.kind === "mp4" && httpsUrl(s.src))?.src ?? null;
  const yt = sp.some((s) => s.kind === "youtube");
  const hlsViaJs = !apple && hlsAll.length > 0;
  const hls = hlsViaJs ? hlsAll.slice(0, HLS_MAX).map(h.viaProxy) : [];
  const hosts = [
    mp4 ? origin(mp4) : "",
    yt ? "https://www.youtube-nocookie.com" : "",
    apple ? hlsAll.slice(0, 1).map(origin)[0] ?? "" : "", // Safari haalt HLS rechtstreeks
  ].filter(Boolean);
  return { thumbs, preconnect: uniek(hosts), hlsChunk: hlsViaJs, hls, mp4 };
}

/** Laagste variant uit een master-playlist (hls.js start ook op niveau 0); "" als er geen is. */
export function laagsteVariant(txt: string, base: string): string {
  const lines = txt.split("\n").map((l) => l.trim());
  let best = "";
  let bw = Infinity;
  lines.forEach((l, i) => {
    if (!l.startsWith("#EXT-X-STREAM-INF:")) return;
    const attrs = l.slice("#EXT-X-STREAM-INF:".length).matchAll(/(?:^|,)([A-Z0-9-]+)=("[^"]*"|[^,]*)/g);
    const waarde = Array.from(attrs).find((m) => m[1] === "BANDWIDTH")?.[2] ?? "";
    const getal = /^\d+$/.test(waarde) ? Number(waarde) : 0;
    const u = lines[i + 1];
    if (Number.isSafeInteger(getal) && getal > 0 && u && !u.startsWith("#") && getal < bw) {
      bw = getal;
      best = u;
    }
  });
  try {
    return best ? new URL(best, base).href : "";
  } catch {
    return "";
  }
}
export function segmenten(txt: string, base: string, max = 2): string[] {
  const out: string[] = [];
  for (const l of txt.split("\n").map((x) => x.trim())) {
    if (!l || l.startsWith("#")) continue;
    try {
      out.push(new URL(l, base).href);
    } catch {
      /* sla over */
    }
    if (out.length >= max) break;
  }
  return out;
}

// ------------------------------------------------------------- browser-runner
const gedaan = new Set<string>(); // al opgewarmd in deze sessie (ook over data-verversingen heen)
const vast = new Set<HTMLImageElement>(); // alleen lopende afbeeldingen vasthouden
export const aantalActievePosters = () => vast.size;
const POSTER_TIMEOUT = 15000;
const LOW = { credentials: "omit", priority: "low" } as RequestInit;
const wachtrij: (() => Promise<unknown>)[] = [];
let actief = 0;

function startTaken() {
  while (actief < GELIJK && wachtrij.length) {
    const taak = wachtrij.shift()!;
    actief++;
    (async () => taak())().catch(() => {}).finally(() => {
      actief--;
      startTaken();
    });
  }
}

const nieuw = (k: string) => (gedaan.has(k) ? false : (gedaan.add(k), true));

async function warmHls(master: string, signal: AbortSignal) {
  // Basis voor relatieve verwijzingen is de uiteindelijke respons-URL: fetch volgt redirects naar andere mappen.
  const get = (u: string) => fetch(u, { ...LOW, signal }).then(async (r) => (r.ok ? { txt: await r.text(), base: r.url || u } : { txt: "", base: u }));
  let { txt, base: b } = await get(master);
  if (!b.includes("://")) b = new URL(b, location.href).href;
  signal.throwIfAborted();
  if (/#EXT-X-STREAM-INF/.test(txt)) {
    const v = laagsteVariant(txt, b);
    ({ txt, base: b } = v ? await get(v) : { txt: "", base: b });
  }
  for (const s of segmenten(txt, b)) {
    signal.throwIfAborted();
    await fetch(s, { ...LOW, signal }).then((r) => r.arrayBuffer());
  }
}

async function warmMp4(src: string, signal: AbortSignal) {
  // Alleen het begin: een Range-aanvraag (Instagram-CDN: CORS *, Range ok). Geeft de server toch 200, dan stoppen we zelf.
  const r = await fetch(src, { ...LOW, signal, headers: { Range: `bytes=0-${MP4_BYTES - 1}` } });
  signal.throwIfAborted();
  const rd = r.body?.getReader();
  if (!rd) return;
  const stop = () => { rd.cancel().catch(() => {}); };
  signal.addEventListener("abort", stop, { once: true });
  try {
    for (let got = 0; got < MP4_BYTES; ) {
      const { done, value } = await rd.read();
      signal.throwIfAborted();
      if (done) return;
      got += value.length;
    }
    stop();
  } finally {
    signal.removeEventListener("abort", stop);
  }
}

// Een vastgelopen fetch of stream mag geen plaats in de wachtrij vasthouden.
async function netwerktaak(taak: (signal: AbortSignal) => Promise<void>) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<void>((ok) => {
    timer = setTimeout(() => { controller.abort(); ok(); }, NETWERK_TIMEOUT);
  });
  try {
    await Promise.race([taak(controller.signal), timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

export function voerUit(p: Plan) {
  for (const o of p.preconnect) {
    if (!nieuw(`pc:${o}`)) continue;
    const l = document.createElement("link");
    l.rel = "preconnect";
    l.href = o;
    l.crossOrigin = "";
    document.head.appendChild(l);
  }
  const taken: (() => Promise<unknown>)[] = [];
  for (const t of p.thumbs) {
    if (!nieuw(`img:${t}`)) continue;
    taken.push(
      () =>
        new Promise<void>((ok) => {
          const im = new Image();
          im.decoding = "async";
          im.referrerPolicy = "no-referrer"; // zoals de <img> in VideoCard
          (im as HTMLImageElement & { fetchPriority?: string }).fetchPriority = "low";
          const klaar = () => {
            clearTimeout(timer);
            im.onload = im.onerror = null;
            vast.delete(im);
            ok();
          };
          const timer = setTimeout(klaar, POSTER_TIMEOUT);
          im.onload = im.onerror = klaar;
          vast.add(im);
          try { im.src = t; } catch { klaar(); }
        })
    );
  }
  // zelfde specifier als feed.tsx: Vite deelt de chunk, de eerste speler vindt hem dus al in de cache
  if (p.hlsChunk && nieuw("hls.js")) taken.push(() => import("hls.js"));
  for (const m of p.hls) if (nieuw(`hls:${m}`)) taken.push(() => netwerktaak((signal) => warmHls(m, signal)));
  if (p.mp4 && nieuw(`mp4:${p.mp4}`)) taken.push(() => netwerktaak((signal) => warmMp4(p.mp4!, signal)));
  // Eén pool voor alle aanroepen, in volgorde van binnenkomst.
  wachtrij.push(...taken);
  startTaken();
}

/** Wacht op load + een idle-moment (en op zichtbaarheid); geeft een annuleerfunctie terug. */
export function naIdle(fn: () => void): () => void {
  let weg = false;
  const stappen: (() => void)[] = [];
  const idle = () => {
    const w = window as Window & { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number };
    if (w.requestIdleCallback) w.requestIdleCallback(go, { timeout: 5000 });
    else setTimeout(go, 1500);
  };
  const go = () => {
    if (weg) return;
    if (document.visibilityState !== "visible") {
      const v = () => {
        if (document.visibilityState !== "visible") return;
        document.removeEventListener("visibilitychange", v);
        idle();
      };
      document.addEventListener("visibilitychange", v);
      stappen.push(() => document.removeEventListener("visibilitychange", v));
      return;
    }
    fn();
  };
  if (document.readyState === "complete") idle();
  else {
    window.addEventListener("load", idle, { once: true });
    stappen.push(() => window.removeEventListener("load", idle));
  }
  return () => {
    weg = true;
    stappen.forEach((s) => s());
  };
}
