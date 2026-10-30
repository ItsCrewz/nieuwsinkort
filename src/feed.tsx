// TikTok-achtige verticale feed voor Filmpjes en Dumpert.
// - Eén video per scherm, CSS scroll-snap (y mandatory); swipen, scrollen, pijltjes of J/K.
// - Alleen huidige ±1 heeft een speler; de volgende wordt vooraf geladen, de rest is alleen een poster.
// - Actieve video via IntersectionObserver (60%); die speelt (standaard zonder geluid), de rest pauzeert.
// - Voortgangsbalk via de Web Animations API op transform: loopt op de compositor, geen JS per frame.
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Video } from "./types";
import { Icon } from "./icons";
import { playerFor, viaProxy, youtubeId } from "./video";

const motionOK = () => !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export { videoSlug } from "./slug";
import { videoSlug } from "./slug";
import { veiligeUrl } from "./url";
import { Stall } from "./stall";
import { bronIndexen, gebruiktNativeHls, isZuinig, POOL_GROOTTE, slotVan } from "./videopool";
import { debug as DEBUG, debugEvent, videoEvents } from "./debug";
import { balkTijden, DebugOverlay } from "./debug-overlay";

// Geluid staat standaard aan en de keuze wordt onthouden (localStorage). Weigert de browser geluid zonder tik
// (iPhone Safari), dan start het filmpje zonder geluid en gaat het geluid aan bij de eerste tik of swipe.
const SOUND_KEY = "nieuwsinkort-geluid";
function soundOn() {
  try {
    return localStorage.getItem(SOUND_KEY) !== "0";
  } catch {
    return true;
  }
}
function saveSound(on: boolean) {
  try {
    localStorage.setItem(SOUND_KEY, on ? "1" : "0");
  } catch {
    /* privémodus */
  }
}
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
type Pool = { els: HTMLVideoElement[]; park: HTMLDivElement };
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
  return { els, park };
}

// ------------------------------------------------------------- MP4 / HLS
// De <video> komt uit de vaste pool (3 elementen, slot = index % 3) en wordt hier alleen van bron gewisseld;
// hij wordt nooit aangemaakt of verwijderd. De host-div is het enige dat React voor deze speler rendert.
function NativePlayer({ v, kind, src, pool, slot, active, preload, paused, muted, bar, seek, onFail, onAutoplayBlocked }: PlayerProps & { kind: "hls" | "mp4"; src: string; pool: Pool; slot: number }) {
  const ref = useRef<HTMLVideoElement>(pool.els[slot]);
  const host = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const video = ref.current;
    host.current?.appendChild(video);
    video.className = "f-media";
    video.loop = true;
    video.setAttribute("aria-label", v.titel);
    if (DEBUG) video.dataset.debugKind = kind;
    delete video.dataset.mse;
    return () => {
      video.classList.remove("on");
      pool.park.appendChild(video);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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
        video.currentTime = to;
      },
    };
    seek.current = api;
    return () => {
      if (seek.current === api) seek.current = null;
    };
  }, [seek]);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    ref.current.classList.toggle("on", shown);
  }, [shown]);
  const hlsRef = useRef<{ config: { maxBufferLength: number; maxMaxBufferLength: number }; startLoad: (p?: number) => void; recoverMediaError: () => void } | null>(null);
  const started = useRef(false);
  const rankRef = useRef(preload);
  rankRef.current = preload;
  const activeNow = useRef(active);
  activeNow.current = active;
  // Waakhond: herladen op dezelfde plek als het beeld vastloopt terwijl de tijd (en dus het geluid) doorloopt.
  const [reloadKey, setReloadKey] = useState(0);
  const resumeAt = useRef(0);
  const reloads = useRef<number[]>([]);
  // bron koppelen (HLS: native op Safari/iOS, anders hls.js via onze proxy)
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    video.muted = mutedRef.current;
    video.playsInline = true;
    video.setAttribute("webkit-playsinline", "");
    delete video.dataset.mse;
    if (kind === "mp4") {
      const fout = () => onFail();
      video.addEventListener("error", fout);
      video.src = src;
      return () => {
        video.removeEventListener("error", fout);
        video.removeAttribute("src");
        video.load();
      };
    }
    // Native HLS alleen op Apple (Safari/iOS). Chrome zegt sinds kort ook "maybe" op HLS, maar zijn eigen
    // speler blijft op Dumpert-streams vaak op 0:00 hangen; daar dus altijd hls.js (MSE) via onze proxy.
    const native = !!video.canPlayType("application/vnd.apple.mpegurl");
    const mse = typeof window !== "undefined" && ("MediaSource" in window || "ManagedMediaSource" in window);
    if (gebruiktNativeHls(native, navigator.vendor || "", navigator.userAgent, mse)) {
      video.src = src;
      return () => {
        video.removeAttribute("src");
        video.load();
      };
    }
    video.dataset.mse = "1";
    let recovered = false;
    let destroyed = false;
    let cancelWait = () => {};
    let hls: { destroy: () => void } | null = null;
    import("hls.js").then(({ default: Hls }) => {
      if (destroyed) return;
      if (!Hls.isSupported()) {
        if (native) {
          video.src = src;
          return;
        }
        return onFail();
      }
      // TikTok-achtig voorladen: ook de volgende filmpjes laden meteen hun eerste ~8 s, op het laagste
      // niveau (snelste start); ABR schaalt daarna op. Het actieve filmpje mag verder bufferen.
      const on = activeNow.current;
      const h = new Hls({
        enableWorker: true,
        startLevel: 0,
        capLevelToPlayerSize: true,
        startFragPrefetch: true,
        autoStartLoad: on,
        maxBufferLength: on ? 30 : 8,
        maxMaxBufferLength: on ? 60 : 8,
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
        if (!d.fatal) return;
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
        video.addEventListener("seeking", () => console.log("[hls] seeking", v.titel, video.currentTime));
      }
      started.current = on;
      h.loadSource(viaProxy(src));
      h.attachMedia(video);
      if (!on) {
        cancelWait = whenReady(() => {
          if (destroyed || started.current) return;
          started.current = true;
          h.startLoad(-1);
        }, rankRef.current === 1 ? 0 : 350);
      }
    });
    return () => {
      destroyed = true;
      cancelWait();
      hlsRef.current = null;
      hls?.destroy();
      video.removeAttribute("src");
      video.load();
    };
  }, [kind, src, onFail, reloadKey]);

  // Buffergrootte meeschalen met de positie in de feed (hls.js leest de config live).
  useEffect(() => {
    const h = hlsRef.current;
    if (!h) return;
    h.config.maxBufferLength = active ? 30 : 8;
    h.config.maxMaxBufferLength = active ? 60 : 8;
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
  // MP4/native: bij voorladen meteen de data ophalen
  useEffect(() => {
    const video = ref.current;
    if (!video || !(active || preload)) return;
    if (video.readyState < 2 && video.networkState === 1 /* IDLE */) video.load();
  }, [active, preload]);

  useEffect(() => {
    const video = ref.current;
    if (video) video.muted = muted;
  }, [muted]);
  useEffect(() => {
    ref.current.preload = active || preload ? "auto" : "metadata";
  }, [active, preload]);

  // Na herladen: terug naar dezelfde tijd en verder spelen.
  useEffect(() => {
    const video = ref.current;
    if (!video || !reloadKey) return;
    const go = () => {
      const t = resumeAt.current;
      if (t > 0 && Math.abs(video.currentTime - t) > 0.5) {
        try {
          video.currentTime = t;
        } catch {
          /* negeer */
        }
      }
      resumeAt.current = 0;
      video.muted = mutedRef.current;
      if (activeNow.current && !pausedRef.current) video.play().catch(() => {});
    };
    video.addEventListener("loadedmetadata", go, { once: true });
    return () => video.removeEventListener("loadedmetadata", go);
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

  // Dezelfde limiet geldt voor beide waakhonden.
  const herlaad = useCallback((video: HTMLVideoElement, now: number) => {
    reloads.current = reloads.current.filter((x) => now - x < 60e3);
    if (reloads.current.length >= 2) return false;
    reloads.current.push(now);
    debugEvent("herladen");
    diag.herladen++;
    resumeAt.current = video.currentTime;
    setReloadKey((k) => k + 1);
    return true;
  }, []);

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
          video.currentTime = doel;
          stall.herstelNaar(video.currentTime);
        } catch { herstelSeek = false; }
        video.play().catch(() => {});
      }
      if (besluit === "herlaad") herlaad(video, now);
    }, 300);
    return () => {
      window.clearInterval(iv);
      video.removeEventListener("seeked", seekKlaar);
    };
  }, [active, paused, reloadKey, zetBar, herlaad]);

  // Waakhond: loopt de tijd door maar komt er >2,5 s geen nieuw beeld, dan de bron herladen (max 2× per minuut).
  useEffect(() => {
    const video = ref.current;
    if (!video || !active || paused) return;
    let lastFrame = performance.now();
    let frames = -1;
    let lastT = video.currentTime;
    let rvfc = 0;
    const vv = video as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number; cancelVideoFrameCallback?: (h: number) => void };
    const onFrame = () => {
      lastFrame = performance.now();
      rvfc = vv.requestVideoFrameCallback!(onFrame);
    };
    if (vv.requestVideoFrameCallback) rvfc = vv.requestVideoFrameCallback(onFrame);
    const iv = window.setInterval(() => {
      const now = performance.now();
      const t = video.currentTime;
      const moving = t > lastT + 0.5 || t + 1 < lastT; // ook een loop telt als beweging
      lastT = t;
      if (!vv.requestVideoFrameCallback) {
        const q = video.getVideoPlaybackQuality?.();
        const n = q ? q.totalVideoFrames : -1;
        if (n !== frames) {
          frames = n;
          lastFrame = now;
        }
      }
      if (video.paused || document.hidden || video.readyState < 3 || !video.videoWidth || !moving) {
        if (!moving || video.paused || document.hidden) lastFrame = now;
        return;
      }
      if (now - lastFrame < 2500) return;
      debugEvent("beeld vast");
      diag.vast++;
      if (!herlaad(video, now)) return;
      if (DEBUG) console.log("[waakhond] beeld staat stil, herladen op", t, v.titel);
      lastFrame = now + 5000;
    }, 1000);
    return () => {
      window.clearInterval(iv);
      if (rvfc && vv.cancelVideoFrameCallback) vv.cancelVideoFrameCallback(rvfc);
    };
  }, [active, paused, reloadKey, v.titel, herlaad]);

  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    if (active && !paused) {
      video.muted = mutedRef.current;
      const p = video.play();
      p?.catch((err: DOMException) => {
        // Geluid zonder tik mag niet: dan zonder geluid verder.
        if (err?.name === "NotAllowedError" && !video.muted) {
          onAutoplayBlocked();
          video.muted = true;
          video.play().catch(() => {});
        }
      });
      // Net gemount (bv. terug swipen): de bron komt soms pas na play() (hls.js laadt async) en dan blijft hij
      // stilstaan. Zodra er data is nog een keer starten.
      const kick = () => {
        if (activeNow.current && !pausedRef.current && video.paused) {
          video.muted = mutedRef.current;
          video.play().catch((err: DOMException) => {
            if (err?.name === "NotAllowedError" && !video.muted) {
              onAutoplayBlocked();
              video.muted = true;
              video.play().catch(() => {});
            }
          });
        }
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
  }, [active, paused, onAutoplayBlocked]);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    let last = 0;
    const sync = () => zetBar(video.currentTime, video.duration, !video.paused && video.readyState > 2);
    const onTime = () => {
      if (video.currentTime !== last && (!barStand.current.loopt || video.currentTime + 0.4 < last)) sync();
      last = video.currentTime;
    };
    const onPlaying = () => {
      setShown(true);
      sync();
    };
    // eerste beeld staat klaar (ook gepauzeerd bij het voorladen): video al tonen, geen zwarte flits
    const onFrame = () => setShown(true);
    video.addEventListener("loadeddata", onFrame);
    const onStop = () => zetBar(video.currentTime, video.duration, false);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("pause", onStop);
    video.addEventListener("waiting", onStop);
    video.addEventListener("stalled", onStop);
    video.addEventListener("seeked", sync);
    video.addEventListener("ratechange", sync);
    video.addEventListener("timeupdate", onTime);
    return () => {
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("loadeddata", onFrame);
      video.removeEventListener("pause", onStop);
      video.removeEventListener("waiting", onStop);
      video.removeEventListener("stalled", onStop);
      video.removeEventListener("seeked", sync);
      video.removeEventListener("ratechange", sync);
      video.removeEventListener("timeupdate", onTime);
    };
  }, [zetBar]);

  return <div ref={host} className="f-slot" />;
}

// ------------------------------------------------------------- YouTube (IFrame API via postMessage)
const YT_ORIGIN = "https://www.youtube-nocookie.com";
function YouTubePlayer({ v, id, active, paused, muted, bar, seek }: PlayerProps & { id: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const loaded = useRef(false);
  const [shown, setShown] = useState(false);
  // src staat vast bij het mounten; daarna stuurt alles via postMessage (geen herladen).
  const [src] = useState(
    () =>
      `${YT_ORIGIN}/embed/${id}?autoplay=${active ? 1 : 0}&mute=1&playsinline=1&enablejsapi=1&controls=0&rel=0&modestbranding=1&iv_load_policy=3&loop=1&playlist=${id}&origin=${encodeURIComponent(window.location.origin)}`
  );
  const post = useCallback((func: string, args: unknown[] = []) => {
    ref.current?.contentWindow?.postMessage(JSON.stringify({ event: "command", func, args }), YT_ORIGIN);
  }, []);
  const state = useRef({ active, paused, muted });
  state.current = { active, paused, muted };
  const apply = useCallback(() => {
    if (!loaded.current) return;
    const s = state.current;
    post(s.muted ? "mute" : "unMute");
    if (s.active && !s.paused) post("playVideo");
    else post("pauseVideo");
  }, [post]);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== YT_ORIGIN || e.source !== ref.current?.contentWindow) return;
      let d: { event?: string; info?: { playerState?: number; currentTime?: number; duration?: number } } | null = null;
      try {
        d = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
      } catch {
        return;
      }
      if (!d) return;
      if (d.event === "onReady") apply();
      const info = d.info;
      if (info && typeof info === "object") {
        const t = info as { playerState?: number; currentTime?: number; duration?: number };
        if (typeof t.duration === "number") dur.current = t.duration;
        if (typeof t.currentTime === "number") cur.current = t.currentTime;
        if (typeof t.playerState === "number") {
          const playing = t.playerState === 1;
          if (playing) setShown(true);
          if (t.playerState !== ps.current || (playing && typeof t.currentTime === "number" && Math.abs(t.currentTime - expect()) > 1)) {
            ps.current = t.playerState;
            since.current = performance.now();
            base.current = cur.current;
            bar.set(cur.current, dur.current, playing);
          }
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
  }, [apply, bar, post, seek]);

  useEffect(() => {
    apply();
    if (!active && loaded.current) post("seekTo", [0, true]);
  }, [active, paused, muted, apply, post]);

  const isShort = /\/shorts\//.test(v.href);
  return (
    <iframe
      ref={ref}
      className={`f-media f-yt ${isShort ? "short" : ""} ${shown ? "on" : ""}`}
      src={src}
      title={v.titel}
      tabIndex={-1}
      allow="autoplay; encrypted-media; picture-in-picture"
      referrerPolicy="strict-origin-when-cross-origin"
      onLoad={() => {
        loaded.current = true;
        // handdruk: daarna stuurt de speler onReady + infoDelivery (tijd, duur, status)
        ref.current?.contentWindow?.postMessage(JSON.stringify({ event: "listening", id, channel: "widget" }), YT_ORIGIN);
        apply();
      }}
    />
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
  };
  const key = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const api = seek.current;
    if (!api) return;
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      e.stopPropagation();
      api.seek(api.cur() + (e.key === "ArrowRight" ? 5 : -5));
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
      aria-valuenow={drag ? Math.round(drag.p * 100) : undefined}
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
};
const Slide = memo(function Slide({ pool, v, i, total, cat, active, mount, preload, paused, muted, onTap, onClose, onAutoplayBlocked }: SlideProps) {
  const p = playerFor(v);
  const [failed, setFailed] = useState(false);
  const fail = useCallback(() => setFailed(true), []);
  const barEl = useRef<HTMLSpanElement>(null);
  const bar = useBar(barEl);
  const seek = useRef<SeekApi | null>(null);
  const [posterOk, setPosterOk] = useState(true);
  const playable = !!p && !failed;
  const props: PlayerProps = { v, active, preload, paused, muted, bar, seek, onFail: fail, onAutoplayBlocked };
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
      <div className="fcol">
        {v.thumb && posterOk ? (
          <img
            className="f-poster"
            src={v.thumb}
            alt=""
            loading={Math.abs(i) < 2 || mount ? "eager" : "lazy"}
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setPosterOk(false)}
          />
        ) : null}
        {playable && mount ? (
          p!.kind === "youtube" ? (
            <YouTubePlayer {...props} id={youtubeId(p!.src)!} />
          ) : (
            <NativePlayer {...props} kind={p!.kind} src={p!.src} pool={pool} slot={slotVan(i)} />
          )
        ) : null}
        {playable ? (
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
        ) : (
          <div className="f-fail">
            <p>{!p ? "Dit filmpje speelt hier niet af." : v.bron === "Instagram" ? "Afspelen lukt niet: de Instagram-link is verlopen of geblokkeerd." : "Afspelen lukt even niet: de bron gaf geen beeld."}</p>
            <a className="f-btn" href={veiligeUrl(v.href)} target="_blank" rel="noreferrer">
              Bekijk bij {v.bron} <Icon name="ext" className="sm" />
            </a>
          </div>
        )}
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
        <Scrub bar={bar} barEl={barEl} seek={seek} enabled={playable && mount} title={v.titel} />
      </div>
    </section>
  );
});

// ------------------------------------------------------------- samenvatting op verzoek
// Knop + onderblad. De server (functions/samenvatting.ts) haalt ondertiteling of luistert de eerste minuten,
// vat samen in simpele punten en bewaart dat per filmpje, dus de tweede keer is het meteen klaar.
type Sv = { ok: true; punten: string[]; bron: "ondertiteling" | "spraak"; sec?: number; model?: string; neuronen?: number; cached?: boolean } | { ok: false; code: string; fout: string };
const svCache = new Map<string, Sv>();
/** Vooraf gemaakte samenvattingen uit /data.json in de cache zetten (knop toont dan "klaar"). */
export function zaaiSamenvattingen(m?: Record<string, { punten: string[]; bron: "ondertiteling" | "spraak"; sec?: number }>) {
  for (const [id, x] of Object.entries(m || {})) if (Array.isArray(x?.punten) && x.punten.length && !svCache.has(id)) svCache.set(id, { ok: true, punten: x.punten, bron: x.bron, sec: x.sec, cached: true });
}
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

// ------------------------------------------------------------- cache opwarmen
const warmed = new Set<string>();
function warmHls(v: Video) {
  const p = playerFor(v);
  if (!p || p.kind !== "hls" || warmed.has(p.src)) return;
  if (/Apple/.test(navigator.vendor || "")) return; // Safari speelt HLS zelf, rechtstreeks van Dumpert
  warmed.add(p.src);
  const master = viaProxy(p.src);
  const get = (u: string) => fetch(u, { credentials: "omit", priority: "low" } as RequestInit).then((r) => (r.ok ? r.text() : ""));
  const lowestVariant = (txt: string, base: string) => {
    const lines = txt.split("\n").map((l) => l.trim());
    let best = "";
    let bw = Infinity;
    lines.forEach((l, i) => {
      const m = /^#EXT-X-STREAM-INF:.*?BANDWIDTH=(\d+)/.exec(l);
      const u = lines[i + 1];
      if (m && u && !u.startsWith("#") && +m[1] < bw) {
        bw = +m[1];
        best = u;
      }
    });
    return best ? new URL(best, base).href : "";
  };
  get(master)
    .then((m) => {
      const base = new URL(master, location.href).href;
      if (!/#EXT-X-STREAM-INF/.test(m)) return { txt: m, base };
      const variant = lowestVariant(m, base); // hls.js start ook op het laagste niveau (startLevel 0)
      return variant ? get(variant).then((txt) => ({ txt, base: variant })) : null;
    })
    .then((r) => {
      if (!r) return;
      const segs = r.txt.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#")).slice(0, 2);
      for (const sg of segs) fetch(new URL(sg, r.base).href, { credentials: "omit", priority: "low" } as RequestInit).catch(() => {});
    })
    .catch(() => {});
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
  const muted = !want || blocked;
  const unmutedAt = useRef(0);
  const [closing, setClosing] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  // Spelers: de pool heeft 3 vaste <video>'s voor slide i-1, i en i+1; welke daarvan een bron krijgen bepaalt
  // videopool.ts (Apple/native HLS: actief + volgende, Save-Data/2G: alleen actief). YouTube-iframes blijven per
  // slide (actief + volgende) buiten de pool.
  const [pool] = useState(maakPool);
  const [nativeHls] = useState(() => gebruiktNativeHls(!!pool.els[0].canPlayType("application/vnd.apple.mpegurl"), navigator.vendor || "", navigator.userAgent, "MediaSource" in window || "ManagedMediaSource" in window));
  const [zuinig] = useState(() => isZuinig((navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection));
  const mounted = useMemo(() => {
    const next = bronIndexen(active, items.length, nativeHls, zuinig);
    for (let i = active; i <= active + (zuinig ? 0 : 1); i++) if (i >= 0 && i < items.length && playerFor(items[i])?.kind === "youtube") next.add(i);
    return next;
  }, [active, items, nativeHls, zuinig]);
  // Cache opwarmen: playlist + eerste stukjes van de komende HLS-filmpjes via onze proxy (edge + browsercache).
  useEffect(() => {
    return whenReady(() => {
      for (let i = active + 1; i <= active + 3 && i < items.length; i++) warmHls(items[i]);
    }, 500);
  }, [active, items]);

  // Geparkeerde pool-elementen blijven in het document (overlay, iOS-gebruiksstatus); weg als de feed sluit.
  useLayoutEffect(() => {
    const r = root.current;
    r?.appendChild(pool.park);
    return () => {
      pool.park.remove();
      pool.els.forEach((el) => { el.removeAttribute("src"); el.load(); });
    };
  }, [pool]);

  const close = useCallback(() => {
    if (!motionOK()) return onClose();
    setClosing(true);
    window.setTimeout(onClose, 220);
  }, [onClose]);

  const go = useCallback((i: number) => {
    const s = scroller.current;
    if (!s) return;
    const n = Math.max(0, Math.min(items.length - 1, i));
    s.scrollTo({ top: n * s.clientHeight, behavior: motionOK() ? "smooth" : "auto" });
  }, [items.length]);

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
          if (e.isIntersecting && e.intersectionRatio >= 0.6) {
            const i = Number((e.target as HTMLElement).dataset.i);
            if (i !== activeRef.current) {
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
  }, [gi]);

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

  // Binnen een tik/swipe (gebruikersgebaar): geluid aanzetten op de huidige video en de volgende alvast
  // "vrijgeven" (play+pause met geluid), zodat iOS die straks ook met geluid laat starten.
  const unmuteNow = useCallback(() => {
    const r = root.current;
    if (!r) return;
    const cur = r.querySelector<HTMLElement>(`.fslide[data-i="${activeRef.current}"]`);
    r.querySelectorAll<HTMLVideoElement>(".fslide video.f-media").forEach((el) => {
      el.muted = false;
      if (cur?.contains(el)) {
        if (!pausedRef.current) el.play().catch(() => {});
      } else if (el.paused && el.dataset.mse !== "1") {
        // (niet bij hls.js/MSE: daar is vrijgeven niet nodig en kan play+pause de MediaSource breken)
        const p = el.play();
        el.pause();
        p?.catch(() => {});
      }
    });
    r.querySelectorAll<HTMLIFrameElement>("iframe.f-yt").forEach((f) =>
      f.contentWindow?.postMessage(JSON.stringify({ event: "command", func: "unMute", args: [] }), "https://www.youtube-nocookie.com")
    );
  }, []);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const soundRef = useRef({ want, blocked });
  soundRef.current = { want, blocked };
  useEffect(() => {
    const r = root.current;
    if (!r) return;
    const onGesture = (e: Event) => {
      const { want: w, blocked: b } = soundRef.current;
      if ((e.target as HTMLElement)?.closest?.(".f-sound")) return; // die knop regelt het zelf
      if (e.type === "keydown" && /^m$/i.test((e as KeyboardEvent).key)) return; // M = geluid aan/uit
      if (w) {
        if (b) {
          unmuteNow();
          unmutedAt.current = Date.now();
          setBlocked(false);
        } else if (e.type !== "keydown") unmuteNow(); // volgende video's blijven vrijgegeven
      }
    };
    const types = ["touchend", "pointerup", "click"];
    types.forEach((t) => r.addEventListener(t, onGesture, { capture: true, passive: true }));
    window.addEventListener("keydown", onGesture, { capture: true, passive: true });
    return () => {
      types.forEach((t) => r.removeEventListener(t, onGesture, { capture: true }));
      window.removeEventListener("keydown", onGesture, { capture: true });
    };
  }, [unmuteNow]);
  const toggleMute = useCallback(() => {
    const { want: w, blocked: b } = soundRef.current;
    if (!w || b) {
      saveSound(true);
      setWant(true);
      setBlocked(false);
      unmuteNow();
    } else {
      saveSound(false);
      setWant(false);
    }
  }, [unmuteNow]);
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
