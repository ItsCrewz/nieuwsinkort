// MP4 / HLS-speler op een element uit de vaste pool; de effecten staan in feed-waakhond.ts en feed-bron.ts.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { viaProxy } from "./videosoort";
import { maakBronvrij } from "./videopool";
import { HerstelBudget } from "./framegezondheid";
import { niveauVan, planVoor } from "./buffer";
import { debug as DEBUG, debugEvent, videoEvents } from "./debug";
import { balkTijden } from "./debug-overlay";
import type { SeekApi } from "./feed-balk";
import { diag, resetReady, signalReady, type HlsRef, type PlayerProps, type Pool } from "./feed-speler";
import { useStallWaakhond, useFrameWaakhond } from "./feed-waakhond";
import { useBronKoppeling } from "./feed-bron";

// ------------------------------------------------------------- MP4 / HLS
// De <video> komt uit de vaste pool (3 elementen, slot = index % 3) en wordt hier alleen van bron gewisseld;
// hij wordt nooit aangemaakt of verwijderd. De host-div is het enige dat React voor deze speler rendert.
export function NativePlayer({ v, kind, src, pool, slot, active, preload, paused, muted, bar, seek, onFail, onAutoplayBlocked, onBeeld }: PlayerProps & { kind: "hls" | "mp4"; src: string; pool: Pool; slot: number }) {
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
    if (v.thumb) video.poster = viaProxy(v.thumb);
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
  const hlsRef = useRef<HlsRef | null>(null);
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

  useStallWaakhond({ ref, active, paused, reloadKey, zetBar, herstel, barStand, hlsRef, seekOp });
  useFrameWaakhond({ ref, gen, pool, slot, kind, src, active, paused, reloadKey, zetBeeld, herstel, seekOp, titel: v.titel });

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

  useBronKoppeling({ ref, gen, pool, slot, kind, src, reloadKey, titel: v.titel, onFail, herstel, zetBeeld, mutedRef, pausedRef, activeNow, rankRef, speelRef, route, wisselRoute, hlsRef, started, resumeAt });

  return <div ref={host} className="f-slot" />;
}
