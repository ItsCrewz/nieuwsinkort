// TikTok-achtige verticale feed voor Filmpjes en Dumpert.
// - Eén video per scherm, CSS scroll-snap (y mandatory); swipen, scrollen, pijltjes of J/K.
// - Alleen huidige ±1 heeft een speler; de volgende wordt vooraf geladen, de rest is alleen een poster.
// - Actieve video via IntersectionObserver (60%); die speelt (standaard zonder geluid), de rest pauzeert.
// - Voortgangsbalk via de Web Animations API op transform: loopt op de compositor, geen JS per frame.
import { bewaarMeting, herstelSwipe, swipeDoel, type SwipeMeting } from "./swipemeting";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import type { Video } from "./types";
import { Icon } from "./icons";
import { playerFor, viaProxy, youtubeId } from "./videosoort";
import { dumpertRoute, isDumpertBron } from "./dumpertroute";

const motionOK = () => !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export { videoSlug } from "./slug";
import { videoSlug } from "./slug";
import { veiligeUrl } from "./url";
import { Stall } from "./stall";
import { bronIndexen, gebruiktNativeHls, maakBronvrij, PoolEigenaars, POOL_GROOTTE, slotVan } from "./videopool";
import { decodeTeller, FrameGezondheid, frameTeller, HerstelBudget } from "./framegezondheid";
import { niveauVan, planVoor } from "./buffer";
import { debug as DEBUG, debugEvent, videoEvents } from "./debug";
import { balkTijden, DebugOverlay, frameTijden } from "./debug-overlay";

import { soundOn, saveSound, geluidTik, onthoudGeluidTik } from "./geluid";
import { posterVerborgen } from "./poster";
import { svCache, type Sv } from "./samenvattingcache";
import { ytStartBesluit, ytVerwijderBesluit, ytEchteFout, geluidMag, autoplayGeblokkeerd, ytEmbedUrl } from "./ytstart";

// Tellers voor diagnose van stilstaande tijd en beeld.
const diag = ((window as unknown as { __nikVideo?: { herladen: number; vast: number; stil: number } }).__nikVideo ??= { herladen: 0, vast: 0, stil: 0 });
diag.stil ??= 0;

// ------------------------------------------------------------- voortgangsbalk
type Bar = { set: (cur: number, dur: number, playing: boolean) => void; stop: () => void };
function useBar(ref: React.RefObject<HTMLElement>): Bar {
  const anim = useRef<Animation | null>(null);
  const set = useCallback(
    (cur: number, dur: number, playing: boolean) => {
      const el = ref.current;
      if (!el || !(dur > 0) || !isFinite(dur)) return;
      const p = Math.min(1, Math.max(0, cur / dur));
      anim.current?.cancel();
      if (!playing || !el.animate) {
        el.style.transform = `scaleX(${p})`;
        anim.current = null;
        return;
      }
      el.style.transform = "";
      anim.current = el.animate([{ transform: `scaleX(${p})` }, { transform: "scaleX(1)" }], {
        duration: Math.max(0, (dur - cur) * 1000),
        easing: "linear",
        fill: "forwards",
      });
    },
    [ref]
  );
  const stop = useCallback(() => {
    anim.current?.pause();
  }, []);
  return { set, stop };
}

// Doorspoelen: de speler meldt zich hier aan, de balk onderaan stuurt hem aan.
export type SeekApi = { dur: () => number; cur: () => number; seek: (t: number) => void };
type SeekRef = React.MutableRefObject<SeekApi | null>;

type PlayerProps = {
  v: Video;
  seek: SeekRef;
  active: boolean;
  preload: number; // 0 = niet, 1 = de volgende, 2 = +2 / -1
  paused: boolean;
  muted: boolean;
  bar: Bar;
  onFail: () => void;
  onAutoplayBlocked: () => void;
  /** Er is echt beeld (poster mag weg) of niet meer (poster terug). */
  onBeeld: (beeld: boolean) => void;
};

// ------------------------------------------------------------- voorrang voor het actieve filmpje
// Voorladen begint pas als het filmpje dat je nu kijkt genoeg buffer heeft (of na 1,5 s), zodat de buren
// de bandbreedte niet afsnoepen bij een koude start. Daarna: eerst +1, even later +2 en -1.
let activeReady = false;
let readyTimer = 0;
const waiters = new Set<() => void>();
function signalReady() {
  if (activeReady) return;
  activeReady = true;
  window.clearTimeout(readyTimer);
  const ws = [...waiters];
  waiters.clear();
  ws.forEach((f) => f());
}
function resetReady() {
  activeReady = false;
  window.clearTimeout(readyTimer);
  readyTimer = window.setTimeout(signalReady, 1500);
}
function whenReady(fn: () => void, delay = 0) {
  let t = 0;
  const run = () => {
    t = window.setTimeout(fn, delay);
  };
  if (activeReady) run();
  else waiters.add(run);
  return () => {
    waiters.delete(run);
    window.clearTimeout(t);
  };
}

// ------------------------------------------------------------- vaste videopool (#50)
// iOS laat maar een paar decoders tegelijk toe en onthoudt per element of het mag spelen. Daarom precies
// POOL_GROOTTE <video>-elementen, één keer gemaakt en geparkeerd in .f-park als ze niet in een slide staan.
type Pool = { els: HTMLVideoElement[]; park: HTMLDivElement; eigenaars: PoolEigenaars };
function maakPool(): Pool {
  const park = document.createElement("div");
  park.className = "f-park";
  park.hidden = true;
  const els = Array.from({ length: POOL_GROOTTE }, (_, slot) => {
    const el = document.createElement("video");
    el.muted = true;
    el.playsInline = true;
    el.setAttribute("webkit-playsinline", "");
    el.loop = true;
    el.dataset.slot = String(slot);
    park.appendChild(el);
    return el;
  });
  return { els, park, eigenaars: new PoolEigenaars() };
}

type VideoMetFrames = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: (now: number, meta?: { mediaTime?: number; presentedFrames?: number }) => void) => number;
  cancelVideoFrameCallback?: (h: number) => void;
  webkitDecodedFrameCount?: number;
};
type FrameStand = { gepresenteerd: number; gedecodeerd: number; op: number; mediaTijd: number; rvfc: boolean; decode: boolean };

// ------------------------------------------------------------- MP4 / HLS
// De <video> komt uit de vaste pool (3 elementen, slot = index % 3) en wordt hier alleen van bron gewisseld;
// hij wordt nooit aangemaakt of verwijderd. De host-div is het enige dat React voor deze speler rendert.
function NativePlayer({ v, kind, src, pool, slot, active, preload, paused, muted, bar, seek, onFail, onAutoplayBlocked, onBeeld }: PlayerProps & { kind: "hls" | "mp4"; src: string; pool: Pool; slot: number }) {
  const ref = useRef<HTMLVideoElement>(pool.els[slot]);
  const host = useRef<HTMLDivElement>(null);
  const gen = useRef(0);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const activeNow = useRef(active);
  activeNow.current = active;
  const rankRef = useRef(preload);
  rankRef.current = preload;
  // Poster blijft liggen tot er echt een beeld gepresenteerd is (niet al bij playing/loadeddata).
  const beeldRef = useRef(false);
  const zetBeeld = useCallback((aan: boolean) => {
    if (beeldRef.current === aan) return;
    beeldRef.current = aan;
    onBeeld(aan);
  }, [onBeeld]);
  const speel = () => {
    const video = ref.current;
    video.muted = mutedRef.current;
    video.play()?.catch((err: DOMException) => {
      // Geluid zonder tik mag niet: dan zonder geluid verder.
      if (err?.name === "NotAllowedError") {
        video.dataset.autoplayBlokkade = "NotAllowedError";
        if (!video.muted) {
          onAutoplayBlocked();
          video.muted = true;
          video.play().catch(() => {});
        }
      }
    });
  };
  const speelRef = useRef(speel);
  speelRef.current = speel;

  useLayoutEffect(() => {
    const video = ref.current;
    // Eerst eigenaar worden (een achtergebleven bron wordt dan synchroon opgeruimd), pas daarna verplaatsen.
    const g = pool.eigenaars.claim(slot);
    gen.current = g;
    host.current?.appendChild(video);
    video.className = "f-media";
    video.loop = true;
    video.muted = mutedRef.current;
    video.playsInline = true;
    video.setAttribute("webkit-playsinline", "");
    video.setAttribute("aria-label", v.titel);
    if (v.thumb) video.poster = v.thumb;
    video.preload = active || preload ? "auto" : "metadata";
    if (DEBUG) { video.dataset.debugKind = kind; video.dataset.gen = String(g); }
    delete video.dataset.mse;
    return () => {
      // Synchroon: pauze, hls.js weg, src weg, load(), beeldstatus wissen; dan pas parkeren.
      pool.eigenaars.geefVrij(slot, g, () => { maakBronvrij(video); pool.park.appendChild(video); });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const seekOp = useRef(-Infinity);
  useEffect(() => {
    const api: SeekApi = {
      dur: () => ref.current?.duration ?? 0,
      cur: () => ref.current?.currentTime ?? 0,
      // hls.js laadt zelf het juiste stukje (via de proxy) als je buiten de buffer springt;
      // Safari doet hetzelfde met zijn eigen HLS-speler.
      seek: (t) => {
        const video = ref.current;
        if (!video || !(video.duration > 0)) return;
        const max = Math.max(0, video.duration - 0.25);
        const to = Math.min(max, Math.max(0, t));
        seekOp.current = performance.now();
        video.currentTime = to;
      },
    };
    seek.current = api;
    return () => {
      if (seek.current === api) seek.current = null;
    };
  }, [seek]);
  const hlsRef = useRef<{ config: { maxBufferLength: number; maxMaxBufferLength: number; maxBufferSize: number }; startLoad: (p?: number) => void; recoverMediaError: () => void } | null>(null);
  const started = useRef(false);
  // Herstel: zelfde element, bron opnieuw koppelen en terug naar dezelfde plek (begrensd, nooit een lus).
  const [reloadKey, setReloadKey] = useState(0);
  const resumeAt = useRef(0);
  const budget = useRef(new HerstelBudget());
  const route = useRef({ src, gewisseld: false });
  if (route.current.src !== src) route.current = { src, gewisseld: false };
  const wisselRoute = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!active || paused) return;
    const video = ref.current;
    const timer = window.setTimeout(() => {
      if (activeNow.current && !pausedRef.current && video.readyState < 1 && !beeldRef.current) wisselRoute.current?.();
    }, 4000);
    return () => window.clearTimeout(timer);
  }, [active, paused, src, reloadKey]);

  // Buffergrootte meeschalen met de positie in de feed (hls.js leest de config live).
  useEffect(() => {
    const h = hlsRef.current;
    if (!h) return;
    const plan = planVoor(active ? 0 : 1, niveauVan((navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string; type?: string } }).connection));
    h.config.maxBufferLength = plan.secs;
    h.config.maxMaxBufferLength = active ? 60 : plan.secs;
    h.config.maxBufferSize = plan.bytes;
    if (active && !started.current) {
      started.current = true;
      h.startLoad(-1);
    }
  }, [active]);
  // Actief: zodra er ~4 s buffer is (of het kan doorspelen) mogen de buren gaan voorladen.
  useEffect(() => {
    const video = ref.current;
    if (!active || !video) return;
    resetReady();
    const check = () => {
      const b = video.buffered;
      const ahead = b.length ? b.end(b.length - 1) - video.currentTime : 0;
      if (video.readyState >= 4 || ahead >= 4) signalReady();
    };
    check();
    video.addEventListener("progress", check);
    video.addEventListener("canplaythrough", check);
    video.addEventListener("timeupdate", check);
    return () => {
      video.removeEventListener("progress", check);
      video.removeEventListener("canplaythrough", check);
      video.removeEventListener("timeupdate", check);
    };
  }, [active]);

  useEffect(() => {
    const video = ref.current;
    if (video) video.muted = muted;
  }, [muted]);
  useEffect(() => {
    ref.current.preload = active || preload ? "auto" : "metadata";
  }, [active, preload]);

  // Na herstel: na de metadata terug naar dezelfde tijd, en pas na die seek weer spelen.
  useEffect(() => {
    const video = ref.current;
    if (!video || !reloadKey) return;
    let gestart = false;
    let timer = 0;
    const start = () => {
      if (gestart) return;
      gestart = true;
      window.clearTimeout(timer);
      video.removeEventListener("seeked", start);
      if (activeNow.current && !pausedRef.current) speelRef.current();
    };
    const go = () => {
      const t = resumeAt.current;
      resumeAt.current = 0;
      if (t > 0 && Math.abs(video.currentTime - t) > 0.5) {
        try {
          seekOp.current = performance.now();
          video.addEventListener("seeked", start);
          timer = window.setTimeout(start, 2000);
          video.currentTime = t;
          return;
        } catch {
          /* negeer */
        }
      }
      start();
    };
    video.addEventListener("loadedmetadata", go, { once: true });
    return () => {
      window.clearTimeout(timer);
      video.removeEventListener("loadedmetadata", go);
      video.removeEventListener("seeked", start);
    };
  }, [reloadKey]);

  const barStand = useRef({ tijd: 0, sinds: 0, loopt: false });
  const zetBar = useCallback((tijd: number, duur: number, loopt: boolean) => {
    barStand.current = { tijd, sinds: performance.now(), loopt };
    bar.set(tijd, duur, loopt);
  }, [bar.set]);

  useEffect(() => {
    const video = ref.current;
    if (!DEBUG || !video || !active) return;
    videoEvents.wis();
    balkTijden.set(video, () => {
      const stand = barStand.current;
      return stand.tijd + (stand.loopt ? (performance.now() - stand.sinds) / 1000 : 0);
    });
    const namen = ["waiting", "stalled", "playing", "pause", "suspend", "error", "emptied"];
    const luister = (e: Event) => debugEvent(e.type);
    namen.forEach((naam) => video.addEventListener(naam, luister));
    return () => { namen.forEach((naam) => video.removeEventListener(naam, luister)); balkTijden.delete(video); };
  }, [active]);

  // Eén budget voor alle waakhonden: max 2× per minuut en 4× per speler.
  const herstel = useCallback((video: HTMLVideoElement, now: number) => {
    if (!budget.current.probeer(now)) {
      debugEvent("herstel-op");
      return false;
    }
    debugEvent("herstel");
    diag.herladen++;
    resumeAt.current = video.currentTime;
    zetBeeld(false);
    try { video.pause(); } catch { /* negeer */ }
    setReloadKey((k) => k + 1);
    return true;
  }, [zetBeeld]);

  useEffect(() => {
    const video = ref.current;
    if (!video || !active || paused) return;
    const stall = new Stall();
    let herstelSeek = false;
    const seekKlaar = () => { herstelSeek = false; };
    video.addEventListener("seeked", seekKlaar);
    const iv = window.setInterval(() => {
      const now = performance.now();
      if (herstelSeek && !video.seeking) herstelSeek = false;
      const stand = barStand.current;
      const balkTijd = stand.tijd + (stand.loopt ? (now - stand.sinds) / 1000 : 0);
      let bufferVooruit = 0;
      for (let i = 0; i < video.buffered.length; i++) {
        if (video.buffered.start(i) <= video.currentTime && video.buffered.end(i) > video.currentTime) {
          bufferVooruit = video.buffered.end(i) - video.currentTime;
          break;
        }
      }
      const besluit = stall.tik({ now, currentTime: video.currentTime, paused: video.paused,
        hidden: document.hidden, ended: video.ended, seeking: video.seeking, herstelSeek, balkTijd,
        bufferVooruit, readyState: video.readyState, networkState: video.networkState });
      if (besluit === "balk-stop") zetBar(video.currentTime, video.duration, false);
      if (besluit === "balk-sync") zetBar(video.currentTime, video.duration, true);
      if (besluit === "balk-stop" || besluit === "balk-sync" || besluit === "nudge" || besluit === "herlaad") debugEvent(besluit);
      if (besluit === "nudge") {
        diag.stil++;
        const h = hlsRef.current;
        h?.startLoad();
        if (h && video.error?.code === 3) h.recoverMediaError();
        let doel = video.currentTime + 0.01;
        for (let i = 0; i < video.buffered.length; i++) {
          if (video.buffered.start(i) > video.currentTime + 0.01) {
            doel = video.buffered.start(i);
            break;
          }
          if (video.buffered.end(i) > video.currentTime) break;
        }
        if (Number.isFinite(video.duration)) doel = Math.min(doel, Math.max(0, video.duration - 0.01));
        try {
          herstelSeek = true;
          seekOp.current = now;
          video.currentTime = doel;
          stall.herstelNaar(video.currentTime);
        } catch { herstelSeek = false; }
        video.play().catch(() => {});
      }
      if (besluit === "herlaad") herstel(video, now);
    }, 300);
    return () => {
      window.clearInterval(iv);
      video.removeEventListener("seeked", seekKlaar);
    };
  }, [active, paused, reloadKey, zetBar, herstel]);

  // Beeldteller per bron: rVFC telt gepresenteerde beelden (leidend zodra hij één keer vuurde), de
  // decodeerteller is terugval. Beide blijven aanwijzingen: een compositorfout kan onzichtbaar blijven.
  const frameStand = useRef<FrameStand>({ gepresenteerd: 0, gedecodeerd: 0, op: 0, mediaTijd: -1, rvfc: false, decode: false });
  useEffect(() => {
    const video = ref.current as VideoMetFrames;
    const g = gen.current;
    const stand: FrameStand = { gepresenteerd: 0, gedecodeerd: 0, op: performance.now(), mediaTijd: -1,
      rvfc: !!video.requestVideoFrameCallback, decode: decodeTeller(video) !== null };
    frameStand.current = stand;
    let h = 0;
    let iv = 0;
    if (stand.rvfc) {
      const cb = (_now: number, meta?: { mediaTime?: number }) => {
        if (!pool.eigenaars.actueel(slot, g)) return;
        stand.gepresenteerd++;
        stand.op = performance.now();
        stand.mediaTijd = meta?.mediaTime ?? -1;
        if (video.videoWidth > 0) zetBeeld(true);
        h = video.requestVideoFrameCallback!(cb);
      };
      h = video.requestVideoFrameCallback!(cb);
    }
    if (stand.decode) {
      // Teller van een vorige bron telt niet mee; een reset (bv. na load) geeft een nieuwe basis.
      let basis = decodeTeller(video) ?? 0;
      let decodeSinds = 0;
      let gemeld = false;
      iv = window.setInterval(() => {
        const n = decodeTeller(video);
        if (n === null || !pool.eigenaars.actueel(slot, g)) return;
        if (n < basis) basis = 0;
        const d = n - basis;
        if (d === stand.gedecodeerd) return;
        stand.gedecodeerd = d;
        if (!stand.rvfc || !stand.gepresenteerd) stand.op = performance.now();
        if (d <= 0 || !video.videoWidth) return;
        if (!stand.rvfc) zetBeeld(true);
        else if (!stand.gepresenteerd) {
          // rVFC zwijgt terwijl er gedecodeerd wordt: na 1,5 s toch tonen (en in de debug melden).
          decodeSinds ||= performance.now();
          if (performance.now() - decodeSinds >= 1500 && !video.paused) {
            if (!gemeld) debugEvent("rvfc-stil");
            gemeld = true;
            zetBeeld(true);
          }
        }
      }, 250);
    }
    // Geen enkele teller: dan het oude signaal (eerste beelddata met afmetingen).
    const toon = () => { if (!stand.rvfc && !stand.decode && video.videoWidth > 0) zetBeeld(true); };
    video.addEventListener("loadeddata", toon);
    video.addEventListener("playing", toon);
    if (DEBUG) frameTijden.set(video, () => ({ ...stand, gen: g }));
    return () => {
      if (h && video.cancelVideoFrameCallback) video.cancelVideoFrameCallback(h);
      window.clearInterval(iv);
      video.removeEventListener("loadeddata", toon);
      video.removeEventListener("playing", toon);
    };
  }, [kind, src, reloadKey, slot, pool, zetBeeld]);

  // Frame-waakhond: loopt de klok zonder nieuwe beelden, of komt er geen eerste beeld (ook bij breedte 0),
  // dan begrensd herstel op hetzelfde element. Pauze, seek, achtergrond en einde tellen niet.
  useEffect(() => {
    const video = ref.current;
    if (!video || !active || paused) return;
    const fg = new FrameGezondheid();
    const iv = window.setInterval(() => {
      const now = performance.now();
      const st = frameStand.current;
      const besluit = fg.tik({ now, currentTime: video.currentTime, paused: video.paused, hidden: document.hidden,
        seeking: video.seeking, ended: video.ended, seekRecent: now - seekOp.current < 1500,
        frames: frameTeller(st), videoWidth: video.videoWidth, readyState: video.readyState });
      if (besluit === "ok") return;
      debugEvent(besluit);
      diag.vast++;
      if (DEBUG) console.log("[waakhond]", besluit, video.currentTime, v.titel);
      // Geen herstel meer over: de poster mag een beeld zonder framebewijs niet blijven afdekken.
      if (!herstel(video, now) && besluit === "geen-eerste-frame" && video.videoWidth > 0) zetBeeld(true);
    }, 500);
    return () => window.clearInterval(iv);
  }, [active, paused, reloadKey, v.titel, herstel, zetBeeld]);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    if (active && !paused) {
      speelRef.current();
      // Net gemount (bv. terug swipen): de bron komt soms pas na play() (hls.js laadt async) en dan blijft hij
      // stilstaan. Zodra er data is nog een keer starten.
      const kick = () => {
        if (activeNow.current && !pausedRef.current && video.paused) speelRef.current();
      };
      video.addEventListener("loadeddata", kick);
      video.addEventListener("canplay", kick);
      return () => {
        video.removeEventListener("loadeddata", kick);
        video.removeEventListener("canplay", kick);
      };
    } else {
      video.pause();
      if (!active) {
        try {
          video.currentTime = 0;
        } catch {
          /* nog geen metadata */
        }
      }
    }
  }, [active, paused]);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    let last = 0;
    const sync = () => zetBar(video.currentTime, video.duration, !video.paused && video.readyState > 2);
    const onTime = () => {
      if (video.currentTime !== last && (!barStand.current.loopt || video.currentTime + 0.4 < last)) sync();
      last = video.currentTime;
    };
    const onStop = () => zetBar(video.currentTime, video.duration, false);
    video.addEventListener("playing", sync);
    video.addEventListener("pause", onStop);
    video.addEventListener("waiting", onStop);
    video.addEventListener("stalled", onStop);
    video.addEventListener("seeked", sync);
    video.addEventListener("ratechange", sync);
    video.addEventListener("timeupdate", onTime);
    return () => {
      video.removeEventListener("playing", sync);
      video.removeEventListener("pause", onStop);
      video.removeEventListener("waiting", onStop);
      video.removeEventListener("stalled", onStop);
      video.removeEventListener("seeked", sync);
      video.removeEventListener("ratechange", sync);
      video.removeEventListener("timeupdate", onTime);
    };
  }, [zetBar]);

  // Bron koppelen als laatste effect: na plaatsing, inline-instellingen en alle listeners (HLS: native op
  // Safari/iOS, anders hls.js via onze proxy). De opruimfunctie staat bij de pool, zodat parkeren synchroon opruimt.
  useEffect(() => {
    const video = ref.current;
    const g = gen.current;
    if (!video || !pool.eigenaars.actueel(slot, g)) return;
    video.muted = mutedRef.current;
    video.playsInline = true;
    video.setAttribute("webkit-playsinline", "");
    delete video.dataset.mse;
    delete video.dataset.dumpertRoute;
    let destroyed = false;
    let recovered = false;
    let cancelWait = () => {};
    let hls: { destroy: () => void } | null = null;
    const fout = () => {
      if (destroyed || !pool.eigenaars.actueel(slot, g)) return;
      debugEvent(`fout ${video.error?.code ?? "?"}`);
      if (wisselRoute.current && !route.current.gewisseld) { wisselRoute.current(); if (route.current.gewisseld) return; }
      // Native HLS: eerst begrensd herstel; mp4 (en een op herstel uitgeputte stream) geeft op.
      if (kind === "hls" && herstel(video, performance.now())) return;
      onFail();
    };
    const opruimen = () => {
      destroyed = true;
      cancelWait();
      hlsRef.current = null;
      video.removeEventListener("error", fout);
      wisselRoute.current = null;
      maakBronvrij(video, hls);
      hls = null;
      zetBeeld(false);
    };
    pool.eigenaars.zetOpruim(slot, g, opruimen);
    const koppelNative = () => {
      delete video.dataset.mse;
      const dumpert = kind === "hls" && isDumpertBron(src);
      if (dumpert) {
        video.dataset.dumpertRoute = route.current.gewisseld ? "proxy" : "direct";
        wisselRoute.current = () => {
          if (destroyed || !pool.eigenaars.actueel(slot, g) || dumpertRoute({ src, nativeHls: true, fout: true, msSindsStart: 0, heeftFrame: false, alGewisseld: route.current.gewisseld }) !== "proxy" || route.current.gewisseld) return;
          route.current.gewisseld = true;
          video.dataset.dumpertRoute = "proxy";
          debugEvent("dumpert proxy");
          video.src = viaProxy(src);
          video.load();
          if (activeNow.current && !pausedRef.current) speelRef.current();
        };
      }
      video.addEventListener("error", fout);
      video.src = dumpert && route.current.gewisseld ? viaProxy(src) : src;
      video.load();
      if (activeNow.current && !pausedRef.current && !resumeAt.current) speelRef.current();
    };
    // Native HLS alleen op Apple (Safari/iOS). Chrome zegt sinds kort ook "maybe" op HLS, maar zijn eigen
    // speler blijft op Dumpert-streams vaak op 0:00 hangen; daar dus altijd hls.js (MSE) via onze proxy.
    const native = kind === "hls" && !!video.canPlayType("application/vnd.apple.mpegurl");
    const mse = typeof window !== "undefined" && ("MediaSource" in window || "ManagedMediaSource" in window);
    if (kind === "mp4" || gebruiktNativeHls(native, navigator.vendor || "", navigator.userAgent, mse)) {
      koppelNative();
      return () => { pool.eigenaars.ruimOp(slot, g); };
    }
    video.dataset.mse = "1";
    if (isDumpertBron(src)) video.dataset.dumpertRoute = "proxy";
    import("hls.js").then(({ default: Hls }) => {
      if (destroyed || !pool.eigenaars.actueel(slot, g)) return;
      if (!Hls.isSupported()) {
        if (native) return koppelNative();
        return onFail();
      }
      // De volgende speler buffert kort op het laagste startniveau; het actieve filmpje mag verder bufferen.
      const on = activeNow.current;
      const plan = planVoor(on ? 0 : 1, niveauVan((navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string; type?: string } }).connection));
      const h = new Hls({
        enableWorker: true,
        startLevel: 0,
        capLevelToPlayerSize: true,
        startFragPrefetch: true,
        autoStartLoad: on || rankRef.current === 1,
        maxBufferLength: plan.secs,
        maxMaxBufferLength: on ? 60 : plan.secs,
        maxBufferSize: plan.bytes,
        backBufferLength: 10,
        startPosition: resumeAt.current > 0 ? resumeAt.current : -1,
      });
      // Niet hoger dan 720p, en H.264 (avc1) als die er is: soepel decoderen op telefoons.
      h.on(Hls.Events.MANIFEST_PARSED, (_e, d) => {
        const lv = d.levels as { height?: number; videoCodec?: string }[];
        const avc = lv.some((l) => /avc1/i.test(l.videoCodec || ""));
        let cap = -1;
        lv.forEach((l, k) => {
          if ((l.height || 0) <= 720 && (!avc || /avc1/i.test(l.videoCodec || ""))) cap = k;
        });
        if (cap >= 0 && cap < lv.length - 1) h.autoLevelCapping = cap;
      });
      hls = h;
      hlsRef.current = h as unknown as typeof hlsRef.current;
      h.on(Hls.Events.ERROR, (_e, d) => {
        if (DEBUG) console.log("[hls]", v.titel, d.type, d.details, d.fatal);
        if (!d.fatal || destroyed) return;
        // Mediafout: eerst één keer herstellen (standaard hls.js-recept), pas daarna opgeven.
        if (d.type === Hls.ErrorTypes.MEDIA_ERROR && !recovered) {
          recovered = true;
          h.recoverMediaError();
          if (activeNow.current && !pausedRef.current) video.play().catch(() => {});
          return;
        }
        onFail();
      });
      if (DEBUG) {
        h.on(Hls.Events.LEVEL_SWITCHED, (_e, d) => console.log("[hls] level", v.titel, d.level));
        h.on(Hls.Events.BUFFER_FLUSHING, (_e, d) => console.log("[hls] flush", v.titel, d.startOffset, d.endOffset, d.type));
      }
      started.current = on || rankRef.current === 1;
      h.loadSource(viaProxy(src));
      h.attachMedia(video);
      if (!started.current) {
        cancelWait = whenReady(() => {
          if (destroyed || started.current) return;
          started.current = true;
          h.startLoad(-1);
        }, rankRef.current === 1 ? 0 : 350);
      }
    });
    return () => { pool.eigenaars.ruimOp(slot, g); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, src, onFail, reloadKey]);

  return <div ref={host} className="f-slot" />;
}

// ------------------------------------------------------------- YouTube (IFrame API via postMessage)
const YT_ORIGIN = "https://www.youtube-nocookie.com";
function YouTubePlayer({ v, id, active, paused, muted, bar, seek, onBeeld, onAutoplayBlocked, vangnet, setVangnet, onYtFout, onYtSpeelt }: PlayerProps & { id: string; vangnet: boolean; setVangnet: (aan: boolean) => void; onYtFout: (code: unknown) => void; onYtSpeelt: () => void }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const klaar = useRef(false);
  const start = useRef({ status: null as number | null, pogingen: 0, sinds: performance.now() });
  const gespeeld = useRef(false);
  const echteFout = useRef(false);
  const foutCode = useRef<unknown>(null);
  const laatsteOpdracht = useRef("-");
  const blokkade = useRef("-");
  const handdruk = useRef(0);
  const geladen = useRef(false);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    onBeeld(shown);
  }, [shown, onBeeld]);
  useEffect(() => () => onBeeld(false), [onBeeld]);
  // src staat vast bij het mounten; daarna stuurt alles via postMessage (geen herladen).
  const [src] = useState(
    () => ytEmbedUrl(id, active, window.location.origin)
  );
  const post = useCallback((func: string, args: unknown[] = []) => {
    laatsteOpdracht.current = func;
    if (ref.current) ref.current.dataset.ytOpdracht = func;
    ref.current?.contentWindow?.postMessage(JSON.stringify({ event: "command", func, args }), YT_ORIGIN);
  }, []);
  const state = useRef({ active, paused, muted });
  state.current = { active, paused, muted };
  const apply = useCallback(() => {
    if (!klaar.current) return;
    const s = state.current;
    if (s.active && !s.paused) {
      post(s.muted ? "mute" : "unMute");
      post("playVideo");
    } else post("pauseVideo");
  }, [post]);
  const listening = useCallback(() => {
    ref.current?.contentWindow?.postMessage(JSON.stringify({ event: "listening", id, channel: "widget" }), YT_ORIGIN);
  }, [id]);
  const diagnose = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.dataset.ytReady = String(klaar.current);
    el.dataset.ytStatus = start.current.status === null ? "" : String(start.current.status);
    el.dataset.ytPogingen = String(start.current.pogingen);
    el.dataset.ytSinds = String(start.current.sinds);
    el.dataset.ytOpdracht = laatsteOpdracht.current;
    el.dataset.ytBlokkade = blokkade.current;
  }, []);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== YT_ORIGIN || e.source !== ref.current?.contentWindow) return;
      let d: { event?: string; info?: unknown; videoId?: string } | null = null;
      try {
        d = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
      } catch {
        return;
      }
      if (!d) return;
      const infoId = d.info && typeof d.info === "object" ? (d.info as { videoData?: { video_id?: string }; video_id?: string }).videoData?.video_id ?? (d.info as { video_id?: string }).video_id : undefined;
      if ((d.videoId && d.videoId !== id) || (infoId && infoId !== id)) return;
      if (d.event === "onReady" && !klaar.current) {
        klaar.current = true;
        post("addEventListener", ["onStateChange"]);
        post("addEventListener", ["onError"]);
        post("addEventListener", ["onAutoplayBlocked"]);
        debugEvent(`YouTube ${id} onReady`);
        diagnose();
        if (state.current.active && !state.current.paused) { start.current.pogingen++; apply(); }
        else apply();
        diagnose();
      }
      if (d.event === "onError" || d.event === "onAutoplayBlocked") {
        debugEvent(`YouTube ${id} ${d.event} ${typeof d.info === "number" ? d.info : ""}`);
        if (d.event === "onError") {
          echteFout.current = true; foutCode.current = d.info; setVangnet(false);
          if (ytEchteFout(d.info)) setShown(true);
          onYtFout(d.info);
        } else if (!echteFout.current && state.current.active && autoplayGeblokkeerd(d.event, d.info)) {
          blokkade.current = d.event; diagnose();
          if (!state.current.muted) { onAutoplayBlocked(); post("mute"); post("playVideo"); }
        }
      }
      const info = d.info;
      const status = d.event === "onStateChange" && typeof info === "number" ? info :
        info && typeof info === "object" && typeof (info as { playerState?: unknown }).playerState === "number" ? (info as { playerState: number }).playerState : null;
      if (d.event === "onStateChange") debugEvent(`YouTube ${id} onStateChange ${status ?? "?"}`);
      if (status !== null) {
        if (!state.current.active) { if (status === 1 || status === 3) post("pauseVideo"); return; }
        start.current.status = status;
        if (status === 1 || status === 3) { gespeeld.current = true; setVangnet(false); setShown(true); }
        if (status === 1) onYtSpeelt();
        diagnose();
      }
      if (info && typeof info === "object") {
        const t = info as { playerState?: number; currentTime?: number; duration?: number };
        if (typeof t.duration === "number") dur.current = t.duration;
        if (typeof t.currentTime === "number") cur.current = t.currentTime;
      }
      if (status !== null) {
        const playing = status === 1;
        if (status !== ps.current || (playing && typeof (info as { currentTime?: number })?.currentTime === "number" && Math.abs(cur.current - expect()) > 1)) {
          ps.current = status;
          since.current = performance.now();
          base.current = cur.current;
          bar.set(cur.current, dur.current, playing);
        }
      }
    };
    const dur = { current: 0 };
    const cur = { current: 0 };
    const ps = { current: -2 };
    const since = { current: 0 };
    const base = { current: 0 };
    const expect = () => base.current + (ps.current === 1 ? (performance.now() - since.current) / 1000 : 0);
    const api: SeekApi = {
      dur: () => dur.current,
      cur: () => expect(),
      seek: (t) => {
        if (!(dur.current > 0)) return;
        const to = Math.min(Math.max(0, dur.current - 0.5), Math.max(0, t));
        post("seekTo", [to, true]);
        cur.current = to;
        base.current = to;
        since.current = performance.now();
        bar.set(to, dur.current, ps.current === 1);
      },
    };
    seek.current = api;
    window.addEventListener("message", onMsg);
    return () => {
      window.removeEventListener("message", onMsg);
      if (seek.current === api) seek.current = null;
    };
  }, [apply, bar.set, diagnose, id, post, seek, setVangnet, onYtFout, onYtSpeelt, onAutoplayBlocked]);

  useEffect(() => {
    start.current = { status: null, pogingen: 0, sinds: performance.now() };
    gespeeld.current = false;
    blokkade.current = "-";
    setVangnet(false);
    if (active && echteFout.current) onYtFout(foutCode.current);
    if (!active) setShown(false);
    else if (klaar.current && !state.current.paused) { start.current.pogingen++; apply(); }
    if (!active && klaar.current) { apply(); post("seekTo", [0, true]); }
    diagnose();
  }, [active, apply, diagnose, post, setVangnet, onYtFout]);

  useEffect(() => { apply(); }, [muted, paused, apply]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (geladen.current && !klaar.current && handdruk.current < 10) { listening(); handdruk.current++; }
      const s = state.current;
      const besluit = ytStartBesluit({ actief: s.active, gepauzeerd: s.paused, klaar: klaar.current, ...start.current, gespeeld: gespeeld.current, fout: echteFout.current, nu: performance.now() });
      if (besluit === "probeer") { start.current.pogingen++; apply(); diagnose(); }
      else if (besluit === "vangnet") {
        if (blokkade.current === "-") {
          blokkade.current = "timeout";
          if (!s.muted) { onAutoplayBlocked(); post("mute"); if (!s.paused) post("playVideo"); }
          diagnose();
        }
        setVangnet(true);
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, [apply, diagnose, listening, onAutoplayBlocked, post, setVangnet]);

  const isShort = /\/shorts\//.test(v.href);
  return (
    <>
    {!shown ? <img className={`f-yt-poster f-yt${isShort ? " short" : ""}`} src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`} alt="" /> : null}
    <iframe
      ref={ref}
      className={`f-media f-yt ${isShort ? "short" : ""}`}
      src={src}
      title={v.titel}
      data-yt-vangnet={vangnet ? "ja" : "nee"}
      allow="autoplay; encrypted-media; picture-in-picture"
      referrerPolicy="strict-origin-when-cross-origin"
      onLoad={() => {
        if (klaar.current) return;
        geladen.current = true;
        handdruk.current = 1;
        diagnose();
        listening();
      }}
    />
    {active && vangnet ? <div className="f-yt-start">Tik om af te spelen</div> : null}
    </>
  );
}

// ------------------------------------------------------------- doorspoelen op de voortgangsbalk
const fmt = (t: number) => {
  if (!isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
};
// De bestaande dunne balk onderaan, maar dan aanraakbaar: tikken of slepen = doorspoelen. Een ruim (onzichtbaar)
// raakvlak met touch-action:none, zodat slepen op de balk de feed niet verticaal laat swipen.
function Scrub({ bar, barEl, seek, enabled, title }: { bar: Bar; barEl: React.RefObject<HTMLSpanElement>; seek: SeekRef; enabled: boolean; title: string }) {
  const hit = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ p: number; d: number } | null>(null);
  const st = useRef<{ id: number; p: number } | null>(null);
  // aria-valuenow/-text: de balk zelf beweegt buiten React om, dus lees de stand bij focus en na toetsen/slepen
  const [pos, setPos] = useState({ t: 0, d: 0 });
  const lees = (t?: number) => {
    const api = seek.current;
    const d = api?.dur() ?? 0;
    setPos(d > 0 && isFinite(d) ? { t: Math.min(d, Math.max(0, t ?? api!.cur())), d } : { t: 0, d: 0 });
  };
  const ratio = (x: number) => {
    const r = hit.current!.getBoundingClientRect();
    return Math.min(1, Math.max(0, (x - r.left) / (r.width || 1)));
  };
  const preview = (p: number, d: number) => {
    bar.set(p * d, d, false);
    setDrag({ p, d });
  };
  const down = (e: React.PointerEvent<HTMLDivElement>) => {
    const api = seek.current;
    const d = api?.dur() ?? 0;
    e.stopPropagation();
    if (!api || !(d > 0) || !isFinite(d)) return;
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* oude browsers */
    }
    const p = ratio(e.clientX);
    st.current = { id: e.pointerId, p };
    preview(p, d);
  };
  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = st.current;
    if (!s || s.id !== e.pointerId) return;
    e.stopPropagation();
    e.preventDefault();
    s.p = ratio(e.clientX);
    preview(s.p, drag?.d ?? seek.current?.dur() ?? 0);
  };
  const up = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = st.current;
    if (!s || s.id !== e.pointerId) return;
    e.stopPropagation();
    st.current = null;
    const api = seek.current;
    const d = api?.dur() ?? 0;
    if (e.type !== "pointercancel" && api && d > 0) api.seek(s.p * d);
    setDrag(null);
    lees(e.type !== "pointercancel" ? s.p * d : undefined);
  };
  const key = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const api = seek.current;
    if (!api) return;
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      e.stopPropagation();
      const t = api.cur() + (e.key === "ArrowRight" ? 5 : -5);
      api.seek(t);
      lees(t);
    }
  };
  return (
    <div
      ref={hit}
      className={`f-scrub ${drag ? "drag" : ""} ${enabled ? "" : "off"}`}
      role="slider"
      aria-label={`Doorspoelen: ${title}`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={drag ? Math.round(drag.p * 100) : pos.d > 0 ? Math.round((pos.t / pos.d) * 100) : 0}
      aria-valuetext={drag ? `${fmt(drag.p * drag.d)} van ${fmt(drag.d)}` : `${fmt(pos.t)} van ${fmt(pos.d)}`}
      onFocus={() => lees()}
      tabIndex={enabled ? 0 : -1}
      onPointerDown={enabled ? down : undefined}
      onPointerMove={enabled ? move : undefined}
      onPointerUp={enabled ? up : undefined}
      onPointerCancel={enabled ? up : undefined}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={enabled ? key : undefined}
    >
      {drag ? (
        <span className="f-time tnum" aria-hidden="true">
          <b>{fmt(drag.p * drag.d)}</b> / {fmt(drag.d)}
        </span>
      ) : null}
      <span className="f-bar" aria-hidden="true">
        <span ref={barEl} />
      </span>
    </div>
  );
}

// ------------------------------------------------------------- één scherm
type SlideProps = {
  pool: Pool;
  v: Video;
  i: number;
  total: number;
  cat: string;
  active: boolean;
  mount: boolean;
  preload: number;
  paused: boolean;
  muted: boolean;
  onTap: () => void;
  onClose: () => void;
  onAutoplayBlocked: () => void;
  onYtFout: (i: number, code: unknown) => void;
  onYtSpeelt: () => void;
};
const Slide = memo(function Slide({ pool, v, i, total, cat, active, mount, preload, paused, muted, onTap, onClose, onAutoplayBlocked, onYtFout, onYtSpeelt }: SlideProps) {
  const p = playerFor(v);
  const ytFout = useCallback((code: unknown) => onYtFout(i, code), [i, onYtFout]);
  const [failed, setFailed] = useState(false);
  const fail = useCallback(() => setFailed(true), []);
  const barEl = useRef<HTMLSpanElement>(null);
  const bar = useBar(barEl);
  const seek = useRef<SeekApi | null>(null);
  const [posterOk, setPosterOk] = useState(true);
  const [beeld, setBeeld] = useState(false);
  const [vangnet, setVangnet] = useState(false);
  const playable = !!p && !failed;
  const ytVangnet = p?.kind === "youtube" && active && playable && mount && vangnet;
  const props: PlayerProps = { v, active, preload, paused, muted, bar, seek, onFail: fail, onAutoplayBlocked, onBeeld: setBeeld };
  // Dubbel tikken links/rechts = 5 s terug/vooruit. De eerste tik pauzeert meteen (geen vertraging);
  // blijkt het een dubbele tik, dan draaien we die pauze terug en springen we.
  const lastTap = useRef({ t: 0, side: 0 });
  const [jump, setJump] = useState<{ side: number; n: number } | null>(null);
  const tap = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      const r = e.currentTarget.getBoundingClientRect();
      const x = (e.clientX - r.left) / (r.width || 1);
      const side = e.detail === 0 ? 0 : x < 0.35 ? -1 : x > 0.65 ? 1 : 0;
      const now = performance.now();
      const prev = lastTap.current;
      const api = seek.current;
      if (side && prev.side === side && now - prev.t < 320 && api) {
        lastTap.current = { t: 0, side: 0 };
        onTap(); // eerste tik terugdraaien
        api.seek(api.cur() + side * 5);
        setJump((j) => ({ side, n: (j?.n ?? 0) + 1 }));
        return;
      }
      lastTap.current = { t: now, side };
      onTap();
    },
    [onTap]
  );
  useEffect(() => {
    if (!jump) return;
    const t = window.setTimeout(() => setJump(null), 600);
    return () => window.clearTimeout(t);
  }, [jump]);
  return (
    <section className={`fslide cat-${cat}`} data-i={i} aria-label={`${i + 1} van ${total}: ${v.titel}`} aria-current={active ? "true" : undefined}>
      <div className={`fcol${p?.kind === "youtube" && playable ? " yt-slide" : ""}`}>
        {playable && mount ? (
          p!.kind === "youtube" ? (
            <YouTubePlayer {...props} id={youtubeId(p!.src)!} vangnet={ytVangnet} setVangnet={setVangnet} onYtFout={ytFout} onYtSpeelt={onYtSpeelt} />
          ) : (
            <NativePlayer {...props} kind={p!.kind} src={p!.src} pool={pool} slot={slotVan(i)} />
          )
        ) : null}
        {/* Poster boven de speler tot er echt beeld is. */}
        {v.thumb && posterOk && !(p?.kind === "youtube" && playable && mount) ? (
          <img
            className={`f-poster${posterVerborgen(p?.kind, beeld, playable, mount, ytVangnet) ? " weg" : ""}`}
            src={v.thumb}
            alt=""
            loading={Math.abs(i) < 2 || mount ? "eager" : "lazy"}
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setPosterOk(false)}
          />
        ) : null}
        {playable && p?.kind !== "youtube" ? (
          <button type="button" className="ftap" aria-label={paused && active ? "Afspelen" : "Pauzeren"} onClick={tap} tabIndex={-1}>
            {active && paused && !jump ? (
              <span className="fstate">
                <Icon name="play" className="fill" />
              </span>
            ) : null}
            {jump ? (
              <span key={jump.n} className={`fjump ${jump.side < 0 ? "l" : "r"}`} aria-hidden="true">
                {jump.side < 0 ? "−5 s" : "+5 s"}
              </span>
            ) : null}
          </button>
        ) : !playable ? (
          <div className="f-fail">
            <p>{!p ? "Dit filmpje speelt hier niet af." : v.bron === "Instagram" ? "Afspelen lukt niet: de Instagram-link is verlopen of geblokkeerd." : "Afspelen lukt even niet: de bron gaf geen beeld."}</p>
            <a className="f-btn" href={veiligeUrl(v.href)} target="_blank" rel="noreferrer">
              Bekijk bij {v.bron} <Icon name="ext" className="sm" />
            </a>
          </div>
        ) : null}
        <div className="f-info">
          <div className="meta">
            {v.bron}
            {v.tijd ? <time className="tnum">{v.tijd}</time> : null}
            {v.populariteit ? <span className="tnum">{v.populariteit}</span> : null}
          </div>
          <h2 className="f-title">{v.titel}</h2>
          {v.ai ? <p className="f-ai">{v.ai}</p> : null}
          {v.ook?.length ? <p className="f-ook">Ook bij {[...new Set(v.ook.map((o) => o.bron))].slice(0, 3).join(", ")}</p> : null}
          <div className="f-actions">
            <a className="f-btn" href={veiligeUrl(v.href)} target="_blank" rel="noreferrer">
              Open bij bron <Icon name="ext" className="sm" />
            </a>
            <SamenvattingKnop v={v} />
            <button type="button" className="f-btn ghost" onClick={onClose}>
              Sluiten
            </button>
          </div>
        </div>
        <Scrub bar={bar} barEl={barEl} seek={seek} enabled={playable && mount && p?.kind !== "youtube"} title={v.titel} />
      </div>
    </section>
  );
});

// ------------------------------------------------------------- samenvatting op verzoek
// Knop + onderblad. De server (functions/samenvatting.ts) haalt ondertiteling of luistert de eerste minuten,
// vat samen in simpele punten en bewaart dat per filmpje, dus de tweede keer is het meteen klaar.
async function haalSamenvatting(id: string, signal: AbortSignal): Promise<Sv> {
  const hit = svCache.get(id);
  if (hit) return hit;
  for (let poging = 0; poging < 8; poging++) {
    let r: Response;
    try {
      r = await fetch("/samenvatting", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }), signal });
    } catch (e) {
      if (signal.aborted) throw e;
      return { ok: false, code: "net", fout: "Geen verbinding. Check je internet en probeer het nog eens." };
    }
    const j = (await r.json().catch(() => null)) as Sv | null;
    if (j && !j.ok && j.code === "bezig") { await new Promise((ok) => setTimeout(ok, 4000)); continue; }
    if (!j) return { ok: false, code: "fout", fout: "Samenvatten lukt even niet. Probeer het later nog eens." };
    if (j.ok || ["geen-tekst", "te-lang", "onbekend"].includes(j.code)) svCache.set(id, j);
    return j;
  }
  return { ok: false, code: "fout", fout: "Het duurt te lang. Probeer het zo nog eens." };
}
const stop = (e: React.SyntheticEvent) => e.stopPropagation();
function SamenvattingKnop({ v }: { v: Video }) {
  const [open, setOpen] = useState(false);
  const klaar = (svCache.get(videoSlug(v)) as any)?.ok === true;
  return (
    <>
      <button type="button" className={`f-btn${klaar ? " sv-klaar" : ""}`} onClick={(e) => { e.stopPropagation(); setOpen(true); }} aria-haspopup="dialog">
        Samenvatting{klaar ? <span className="sv-dot" aria-label="klaar" title="Staat al klaar" /> : null}
      </button>
      {open ? createPortal(<SamenvattingBlad v={v} onClose={() => setOpen(false)} />, document.body) : null}
    </>
  );
}
function SamenvattingBlad({ v, onClose }: { v: Video; onClose: () => void }) {
  const id = videoSlug(v);
  const [res, setRes] = useState<Sv | null>(() => svCache.get(id) || null);
  const [n, setN] = useState(0);
  const closeBtn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (svCache.has(id) && n === 0) return;
    const ac = new AbortController();
    setRes(null);
    haalSamenvatting(id, ac.signal).then(setRes, () => {});
    return () => ac.abort();
  }, [id, n]);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    closeBtn.current?.focus({ preventScroll: true });
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); onClose(); } };
    window.addEventListener("keydown", key, true);
    return () => { window.removeEventListener("keydown", key, true); prev?.focus?.({ preventScroll: true }); };
  }, [onClose]);
  const min = res && res.ok && res.sec ? Math.max(1, Math.round(res.sec / 60)) : 0;
  return (
    <div className="sv-wrap" onClick={(e) => { e.stopPropagation(); onClose(); }} onPointerDown={stop} onTouchStart={stop} onTouchMove={stop} onWheel={stop} onKeyDown={stop}>
      <div className="sv-sheet" role="dialog" aria-modal="true" aria-labelledby="sv-kop" onClick={stop}>
        <div className="sv-head">
          <h2 id="sv-kop" className="sv-kop">Samenvatting</h2>
          <button ref={closeBtn} type="button" className="sv-x" onClick={onClose} aria-label="Sluit samenvatting">
            <Icon name="x" />
          </button>
        </div>
        <p className="sv-titel">{v.titel}</p>
        <div className="sv-body" aria-live="polite" aria-busy={!res}>
          {!res ? (
            <p className="sv-laden"><span className="sv-dot" aria-hidden="true" />Even kijken en luisteren…</p>
          ) : res.ok ? (
            <>
              <ul className="sv-punten">{res.punten.map((p, k) => <li key={k}>{p}</li>)}</ul>
              <p className="sv-bron">
                {res.bron === "spraak" ? `Uit wat er gezegd wordt${min ? ` (eerste ${min} min)` : ""}` : "Uit de ondertiteling"} · samengevat door AI, kan foutjes bevatten
              </p>
            </>
          ) : (
            <>
              <p className="sv-fout">{res.fout}</p>
              {["fout", "net", "bezig", "geblokkeerd"].includes(res.code) ? (
                <button type="button" className="f-btn" onClick={() => { svCache.delete(id); setN((x) => x + 1); }}>Probeer opnieuw</button>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------- de feed
export type FeedGroup = { id: string; label: string; list: Video[] };
export function Feed({
  list,
  cat,
  start,
  onClose,
  groups,
  onGroup,
}: {
  list: Video[];
  cat: "filmpjes" | "dumpert";
  start: string | null;
  onClose: () => void;
  groups?: FeedGroup[];
  onGroup?: (id: string) => void;
}) {
  // Lijsten vastzetten zolang de feed open is (de 15-minuten-verversing schuift dan niets onder je duim weg).
  const [gs] = useState(() => (groups && groups.length > 1 ? groups : null));
  const [gi, setGi] = useState(() => {
    if (!gs) return 0;
    const k = gs.findIndex((g) => g.list.some((v) => videoSlug(v) === start));
    return k < 0 ? 0 : k;
  });
  const [items, setItems] = useState(() => (gs ? gs[gi].list : list));
  const [first] = useState(() => Math.max(0, items.findIndex((v) => videoSlug(v) === start)));
  const [active, setActive] = useState(first);
  // Wisselen tussen Shorts en Journaals: nieuwe lijst, vanaf de eerste video (de scroller wordt vers opgebouwd).
  const pickGroup = useCallback(
    (k: number) => {
      if (!gs || k === gi) return;
      setGi(k);
      setItems(gs[k].list);
      setActive(0);
      setPaused(false);
      onGroup?.(gs[k].id);
    },
    [gs, gi, onGroup]
  );
  const [paused, setPaused] = useState(false);
  // want = jouw keuze (onthouden); blocked = de browser weigerde geluid zonder tik. Te horen = want && !blocked.
  const [want, setWant] = useState(soundOn);
  const [blocked, setBlocked] = useState(false);
  const [getikt, setGetikt] = useState(geluidTik);
  const muted = !geluidMag(want, getikt, blocked);
  const unmutedAt = useRef(0);
  const [closing, setClosing] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  // Spelers: de pool heeft 3 vaste <video>'s voor slide i-1, i en i+1; welke daarvan een bron krijgen bepaalt
  // videopool.ts (actief + volgende). YouTube-iframes blijven per
  // slide (actief + volgende) buiten de pool.
  const [pool] = useState(maakPool);
  const mounted = useMemo(() => {
    const next = bronIndexen(active, items.length);
    for (let i = active; i <= active + 1; i++) if (i >= 0 && i < items.length && playerFor(items[i])?.kind === "youtube") next.add(i);
    return next;
  }, [active, items]);
  // Geparkeerde pool-elementen blijven in het document (overlay, iOS-gebruiksstatus); weg als de feed sluit.
  useLayoutEffect(() => {
    const r = root.current;
    r?.appendChild(pool.park);
    return () => {
      pool.park.remove();
      pool.els.forEach((el) => maakBronvrij(el));
    };
  }, [pool]);

  const close = useCallback(() => {
    if (!motionOK()) return onClose();
    setClosing(true);
    window.setTimeout(onClose, 220);
  }, [onClose]);

  const metingen = useRef<SwipeMeting[]>([]);
  const lopendeMeting = useRef<SwipeMeting | null>(null);
  const swipeStart = useRef<{ van: number; naar: number; speelde: boolean } | null>(null);
  const herstel = useCallback(() => {
    const poging = swipeStart.current;
    if (!poging) return;
    swipeStart.current = null;
    if (!herstelSwipe(poging.van, poging.naar, activeRef.current)) return;
    const volgend = pool.els[slotVan(poging.naar)];
    if (Number(volgend.closest<HTMLElement>(".fslide")?.dataset.i) === poging.naar) {
      volgend.pause();
      try { volgend.currentTime = 0; } catch {}
    }
    const huidig = pool.els[slotVan(poging.van)];
    if (poging.speelde && !pausedRef.current && Number(huidig.closest<HTMLElement>(".fslide")?.dataset.i) === poging.van) huidig.play().catch(() => {});
  }, [pool]);
  const startDirect = useCallback((i: number) => {
    const video = pool.els[slotVan(i)];
    const slide = video.closest<HTMLElement>(".fslide");
    if (!slide || Number(slide.dataset.i) !== i || !video.getAttribute("src")) return;
    // Eerst de uitgaande speler stil, dan pas de inkomende starten: nooit twee decoders tegelijk aan het spelen.
    const vorige = activeRef.current;
    const uitIframe = i !== vorige ? root.current?.querySelector<HTMLIFrameElement>(`.fslide[data-i="${vorige}"] iframe.f-yt`) : null;
    uitIframe?.contentWindow?.postMessage(JSON.stringify({ event: "command", func: "pauseVideo", args: [] }), YT_ORIGIN);
    const uit = i !== vorige ? pool.els[slotVan(vorige)] : null;
    const uitSlide = uit?.closest<HTMLElement>(".fslide") ?? null;
    const uitSpeelde = !!uit && !uit.paused && Number(uitSlide?.dataset.i) === vorige;
    if (uitSpeelde) uit!.pause();
    video.muted = !geluidMag(soundRef.current.want, geluidTik(), soundRef.current.blocked);
    if (lopendeMeting.current?.slide === i && lopendeMeting.current.play === undefined) lopendeMeting.current.play = performance.now();
    video.play().catch((err: DOMException) => {
      if (err?.name === "NotAllowedError") {
        video.dataset.autoplayBlokkade = "NotAllowedError";
        if (!video.muted) { setBlocked(true); video.muted = true; video.play().catch(() => {}); }
      }
    });
    if (i !== vorige && swipeStart.current?.naar !== i) window.setTimeout(() => {
      if (i === activeRef.current) return;
      if (video.closest<HTMLElement>(".fslide") === slide) video.pause();
      // Swipe ging niet door: de vorige speelt verder.
      if (uitIframe && activeRef.current === vorige && !pausedRef.current) uitIframe.contentWindow?.postMessage(JSON.stringify({ event: "command", func: "playVideo", args: [] }), YT_ORIGIN);
      if (uitSpeelde && activeRef.current === vorige && !pausedRef.current && uit!.closest<HTMLElement>(".fslide") === uitSlide) uit!.play().catch(() => {});
    }, 1500);
  }, [pool]);

  const richting = useRef<-1 | 1>(1);
  const aanraking = useRef(false);
  const go = useCallback((i: number) => {
    const s = scroller.current;
    if (!s) return;
    const n = Math.max(0, Math.min(items.length - 1, i));
    if (n !== activeRef.current) richting.current = n < activeRef.current ? -1 : 1;
    startDirect(n);
    s.scrollTo({ top: n * s.clientHeight, behavior: motionOK() ? "smooth" : "auto" });
  }, [items.length, startDirect]);

  const ytFout = useCallback((i: number, code: unknown) => {
    const besluit = ytVerwijderBesluit(code, i, activeRef.current, items.length, richting.current);
    if (!besluit.verwijder) return;
    const s = scroller.current;
    const oudActief = activeRef.current;
    const top = s?.scrollTop ?? 0;
    const hoogte = s?.clientHeight ?? 0;
    // Bewaar ook een gedeeltelijke swipe wanneer een vooraf geladen video verdwijnt.
    const nieuwTop = i === oudActief && !aanraking.current
      ? besluit.actief * hoogte
      : top - (i * hoogte < top ? Math.min(hoogte, top - i * hoogte) : 0);
    swipeStart.current = null;
    activeRef.current = besluit.actief;
    flushSync(() => {
      setItems((oud) => oud.filter((_, index) => index !== i));
      setActive(besluit.actief);
    });
    if (s) s.scrollTop = nieuwTop;
  }, [items.length]);
  const ytSpeelt = useCallback(() => {}, []);

  // Start op de gekozen video, vóór de eerste paint.
  useLayoutEffect(() => {
    const s = scroller.current;
    if (s) s.scrollTop = first * s.clientHeight;
  }, [first]);

  // Welke video staat in beeld (≥60%)?
  useEffect(() => {
    const s = scroller.current;
    if (!s || !window.IntersectionObserver) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.target.isConnected && e.isIntersecting && e.intersectionRatio >= 0.6) {
            const i = Number((e.target as HTMLElement).dataset.i);
            if (i !== activeRef.current) {
              richting.current = i < activeRef.current ? -1 : 1;
              startDirect(i);
              activeRef.current = i;
              if (lopendeMeting.current?.slide === i) lopendeMeting.current.actief = performance.now();
              setActive(i);
              setPaused(false);
            }
          }
        }
      },
      { root: s, threshold: [0.6] }
    );
    s.querySelectorAll(".fslide").forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, [gi, items, startDirect]);

  // Deep link per video, zonder nieuwe history-stap en zonder hashchange.
  useEffect(() => {
    const v = items[active];
    if (!v || closing) return;
    const h = `#/${cat}/${encodeURIComponent(videoSlug(v))}`;
    if (window.location.hash !== h) window.history.replaceState(window.history.state, "", h);
  }, [active, cat, items, closing]);

  // Toetsen, scroll-lock, focus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key;
      if (k === "Escape") close();
      else if (k === "ArrowDown" || k === "j" || k === "J" || k === "PageDown") go(activeRef.current + 1);
      else if (k === "ArrowUp" || k === "k" || k === "K" || k === "PageUp") go(activeRef.current - 1);
      else if (k === " " && !(e.target as HTMLElement)?.closest?.("a,button")) setPaused((p) => !p);
      else if (k === "m" || k === "M") toggleMute();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    const html = document.documentElement;
    const prev = [html.style.overflow, document.body.style.overflow];
    html.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    const prevFocus = document.activeElement as HTMLElement | null;
    scroller.current?.focus({ preventScroll: true });
    return () => {
      window.removeEventListener("keydown", onKey);
      html.style.overflow = prev[0];
      document.body.style.overflow = prev[1];
      prevFocus?.focus?.({ preventScroll: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [close, go]);

  // Binnen een tik/swipe (gebruikersgebaar): geluid aanzetten op de huidige video en de andere poolelementen
  // één keer "vrijgeven" (play+pause met geluid), zodat iOS die straks ook met geluid laat starten. iOS
  // onthoudt dat per element; niet bij elk gebaar opnieuw, dat geeft alleen play/pause-churn.
  const vrijgegeven = useRef(new WeakSet<HTMLVideoElement>());
  const unmuteNow = useCallback(() => {
    const r = root.current;
    if (!r) return;
    const cur = r.querySelector<HTMLElement>(`.fslide[data-i="${activeRef.current}"]`);
    let huidig: HTMLVideoElement | null = null;
    pool.els.forEach((el) => {
      el.muted = false;
      if (cur?.contains(el)) {
        huidig = el;
      } else if (el.paused && el.dataset.mse !== "1" && !vrijgegeven.current.has(el)) {
        // (niet bij hls.js/MSE: daar is vrijgeven niet nodig en kan play+pause de MediaSource breken)
        vrijgegeven.current.add(el);
        const p = el.play();
        el.pause();
        p?.catch(() => {});
      }
    });
    // De huidige pas na het (gepauzeerde) vrijgeven van de andere starten.
    const h = huidig as HTMLVideoElement | null;
    if (h) {
      vrijgegeven.current.add(h);
      if (h.paused && !pausedRef.current) h.play().catch(() => {});
    }
    r.querySelectorAll<HTMLIFrameElement>('.fslide[aria-current="true"] iframe.f-yt').forEach((f) =>
      f.contentWindow?.postMessage(JSON.stringify({ event: "command", func: "unMute", args: [] }), "https://www.youtube-nocookie.com")
    );
  }, [pool]);
  const soundRef = useRef({ want, blocked });
  soundRef.current = { want, blocked };
  useEffect(() => {
    const r = root.current;
    if (!r) return;
    const onGesture = (e: Event) => {
      if (!e.isTrusted) return;
      onthoudGeluidTik();
      setGetikt(true);
      const { want: w, blocked: b } = soundRef.current;
      if ((e.target as HTMLElement)?.closest?.(".f-sound")) return; // die knop regelt het zelf
      if (e.type === "keydown" && /^m$/i.test((e as KeyboardEvent).key)) return; // M = geluid aan/uit
      if (w) {
        if (b) {
          // Geluid werd geweigerd: alle elementen opnieuw vrijgeven.
          vrijgegeven.current = new WeakSet();
          unmuteNow();
          unmutedAt.current = Date.now();
          setBlocked(false);
        } else unmuteNow(); // volgende video's blijven vrijgegeven
      }
    };
    let startY = 0;
    let gestart = false;
    const touchStart = (e: TouchEvent) => { aanraking.current = true; startY = e.changedTouches[0]?.clientY ?? 0; gestart = false; };
    const touchMove = (e: TouchEvent) => {
      if (gestart) return;
      const i = swipeDoel(startY, e.changedTouches[0]?.clientY ?? startY, activeRef.current);
      if (i === null) return;
      richting.current = i < activeRef.current ? -1 : 1;
      if (root.current?.querySelector(`.fslide[data-i="${activeRef.current}"] iframe.f-yt`)) return;
      const video = pool.els[slotVan(i)];
      if (Number(video.closest<HTMLElement>(".fslide")?.dataset.i) !== i || !video.getAttribute("src")) return;
      gestart = true;
      const huidig = pool.els[slotVan(activeRef.current)];
      swipeStart.current = { van: activeRef.current, naar: i, speelde: !huidig.paused && Number(huidig.closest<HTMLElement>(".fslide")?.dataset.i) === activeRef.current };
      if (DEBUG) {
        const m: SwipeMeting = { slide: i, gesture: performance.now() };
        lopendeMeting.current = m;
        bewaarMeting(metingen.current, m);
        (window as unknown as { __swipeMetingen: SwipeMeting[] }).__swipeMetingen = metingen.current;
        video.addEventListener("playing", () => { m.playing ??= performance.now(); }, { once: true });
        (video as VideoMetFrames).requestVideoFrameCallback?.(() => { m.frame ??= performance.now(); });
        const poster = video.closest(".fcol")?.querySelector(".f-poster");
        if (poster?.classList.contains("weg")) m.poster = performance.now();
        else if (poster) {
          const observer = new MutationObserver(() => { if (poster.classList.contains("weg")) { m.poster = performance.now(); observer.disconnect(); } });
          observer.observe(poster, { attributes: true, attributeFilter: ["class"] });
          window.setTimeout(() => observer.disconnect(), 5000);
        }
      }
      startDirect(i);
    };
    let herstelTimer: number | undefined;
    const touchEnd = (e: TouchEvent) => {
      aanraking.current = false;
      const doel = swipeDoel(startY, e.changedTouches[0]?.clientY ?? startY, swipeStart.current?.van ?? activeRef.current);
      if (doel === null || (swipeStart.current && doel !== swipeStart.current.naar)) herstel();
      if (doel !== null) startDirect(doel);
      window.clearTimeout(herstelTimer);
      herstelTimer = window.setTimeout(herstel, 1500);
    };
    const touchCancel = () => { aanraking.current = false; herstel(); };
    const scrollEnd = () => herstel();
    r.addEventListener("touchstart", touchStart, { passive: true });
    r.addEventListener("touchmove", touchMove, { passive: true });
    r.addEventListener("touchend", touchEnd, { passive: true });
    r.addEventListener("touchcancel", touchCancel, { passive: true });
    scroller.current?.addEventListener("scrollend", scrollEnd);
    const types = ["touchend", "pointerup", "click"];
    types.forEach((t) => r.addEventListener(t, onGesture, { capture: true, passive: true }));
    window.addEventListener("keydown", onGesture, { capture: true, passive: true });
    return () => {
      r.removeEventListener("touchstart", touchStart);
      r.removeEventListener("touchmove", touchMove);
      r.removeEventListener("touchend", touchEnd);
      r.removeEventListener("touchcancel", touchCancel);
      scroller.current?.removeEventListener("scrollend", scrollEnd);
      window.clearTimeout(herstelTimer);
      types.forEach((t) => r.removeEventListener(t, onGesture, { capture: true }));
      window.removeEventListener("keydown", onGesture, { capture: true });
    };
  }, [unmuteNow, startDirect]);
  const toggleMute = useCallback(() => {
    onthoudGeluidTik();
    setGetikt(true);
    const { want: w, blocked: b } = soundRef.current;
    if (!w || b) {
      saveSound(true);
      setWant(true);
      setBlocked(false);
      vrijgegeven.current = new WeakSet();
      unmuteNow();
    } else {
      saveSound(false);
      setWant(false);
    }
  }, [unmuteNow, startDirect]);
  // De tik die het geluid aanzette pauzeert het filmpje niet.
  const onTap = useCallback(() => {
    if (Date.now() - unmutedAt.current < 700) return;
    setPaused((p) => !p);
  }, []);
  const onBlocked = useCallback(() => setBlocked(true), []);

  const label = cat === "dumpert" ? "Dumpert" : gs ? gs[gi].label : "Filmpjes";
  return createPortal(
    <div className="app modal-root">
      {DEBUG && <DebugOverlay />}
      <div
        ref={root}
        className={`feed ${closing ? "out" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={`${label}: video ${active + 1} van ${items.length}`}
        onAnimationEnd={(e) => {
          if (e.target === root.current && closing) onClose();
        }}
      >
        <div className={`feed-scroll ${gi ? "g1" : "g0"}`} key={gi} ref={scroller} tabIndex={-1}>
          {items.map((v, i) => (
            <Slide
              pool={pool}
              key={videoSlug(v) + i}
              v={v}
              i={i}
              total={items.length}
              cat={cat}
              active={i === active}
              mount={mounted.has(i)}
              preload={i === active + 1 ? 1 : 0}
              paused={i === active && paused}
              muted={muted}
              onTap={onTap}
              onClose={close}
              onAutoplayBlocked={onBlocked}
              onYtFout={ytFout}
              onYtSpeelt={ytSpeelt}
            />
          ))}
        </div>
        <div className="feed-top">
          <div className="feed-topcol">
            <button type="button" className="f-icon" aria-label="Sluit de filmpjes" onClick={close}>
              <Icon name="x" />
            </button>
            <span className="f-count tnum">
              {label} · {active + 1}/{items.length}
            </span>
            <button type="button" className={`f-icon f-sound ${muted ? "" : "on"}`} aria-pressed={!muted} aria-label={muted ? "Geluid aan" : "Geluid uit"} onClick={toggleMute}>
              <Icon name={muted ? "mute" : "volume"} />
              {muted ? <span>Tik voor geluid</span> : null}
            </button>
            {gs ? (
              <div className="f-tabs" role="tablist" aria-label="Soort filmpjes">
                {gs.map((g, k) => (
                  <button key={g.id} type="button" role="tab" className="f-tab" aria-selected={k === gi} onClick={() => pickGroup(k)}>
                    {g.label}
                    <span className="tnum">{g.list.length}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        <div className="feed-nav" aria-hidden="false">
          <button type="button" className="f-icon" aria-label="Vorige video" disabled={active === 0} onClick={() => go(active - 1)}>
            <Icon name="chevup" />
          </button>
          <button type="button" className="f-icon" aria-label="Volgende video" disabled={active === items.length - 1} onClick={() => go(active + 1)}>
            <Icon name="chevdown" />
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
