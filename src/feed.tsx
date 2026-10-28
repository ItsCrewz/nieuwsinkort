// TikTok-achtige verticale feed voor Filmpjes en Dumpert.
// - Eén video per scherm, CSS scroll-snap (y mandatory); swipen, scrollen, pijltjes of J/K.
// - Alleen huidige ±1 heeft een speler; de volgende wordt vooraf geladen, de rest is alleen een poster.
// - Actieve video via IntersectionObserver (60%); die speelt (standaard zonder geluid), de rest pauzeert.
// - Voortgangsbalk via de Web Animations API op transform: loopt op de compositor, geen JS per frame.
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Video } from "./types";
import { Icon } from "./icons";
import { playerFor, viaProxy, youtubeId } from "./video";

const motionOK = () => !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function videoSlug(v: Video): string {
  const yt = youtubeId(v.embed || "") || youtubeId(v.href);
  if (yt) return `yt-${yt}`;
  let m = /dumpert\.nl\/item\/([\w-]+)/.exec(v.href);
  if (m) return `d-${m[1]}`;
  m = /\/status\/(\d+)/.exec(v.href);
  if (m) return `x-${m[1]}`;
  m = /reddit\.com\/r\/[\w-]+\/comments\/(\w+)/.exec(v.href);
  if (m) return `r-${m[1]}`;
  m = /instagram\.com\/(?:reel|p)\/([\w-]+)/.exec(v.href);
  if (m) return `ig-${m[1]}`;
  return (
    v.titel
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "video"
  );
}

// Geluid aan/uit geldt voor de hele sessie.
const SOUND_KEY = "nieuwsinkort-feed-geluid";
function soundOn() {
  try {
    return sessionStorage.getItem(SOUND_KEY) === "1";
  } catch {
    return false;
  }
}

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

type PlayerProps = {
  v: Video;
  active: boolean;
  preload: boolean;
  paused: boolean;
  muted: boolean;
  bar: Bar;
  onFail: () => void;
  onAutoplayBlocked: () => void;
};

// ------------------------------------------------------------- MP4 / HLS
const DEBUG = (() => {
  try {
    return localStorage.getItem("nieuwsinkort-debug") === "1";
  } catch {
    return false;
  }
})();
function NativePlayer({ v, kind, src, active, preload, paused, muted, bar, onFail, onAutoplayBlocked }: PlayerProps & { kind: "hls" | "mp4"; src: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [shown, setShown] = useState(false);
  // bron koppelen (HLS: native op Safari/iOS, anders hls.js via onze proxy)
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    if (kind === "mp4") {
      video.src = src;
      return () => {
        video.removeAttribute("src");
        video.load();
      };
    }
    // Native HLS alleen op Apple (Safari/iOS). Chrome zegt sinds kort ook "maybe" op HLS, maar zijn eigen
    // speler blijft op Dumpert-streams vaak op 0:00 hangen; daar dus altijd hls.js (MSE) via onze proxy.
    const native = !!video.canPlayType("application/vnd.apple.mpegurl");
    const apple = /Apple/.test(navigator.vendor || "") || /iP(hone|ad|od)/.test(navigator.userAgent);
    const mse = typeof window !== "undefined" && ("MediaSource" in window || "ManagedMediaSource" in window);
    if (native && (apple || !mse)) {
      video.src = src;
      return () => {
        video.removeAttribute("src");
        video.load();
      };
    }
    let destroyed = false;
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
      const h = new Hls({ enableWorker: true, maxBufferLength: 12, capLevelToPlayerSize: true });
      hls = h;
      h.on(Hls.Events.ERROR, (_e, d) => {
        if (DEBUG) console.log("[hls]", v.titel, d.type, d.details, d.fatal);
        if (d.fatal) onFail();
      });
      if (DEBUG) {
        h.on(Hls.Events.LEVEL_SWITCHED, (_e, d) => console.log("[hls] level", v.titel, d.level));
        h.on(Hls.Events.BUFFER_FLUSHING, (_e, d) => console.log("[hls] flush", v.titel, d.startOffset, d.endOffset, d.type));
        video.addEventListener("seeking", () => console.log("[hls] seeking", v.titel, video.currentTime));
      }
      h.loadSource(viaProxy(src));
      h.attachMedia(video);
    });
    return () => {
      destroyed = true;
      hls?.destroy();
    };
  }, [kind, src, onFail]);

  useEffect(() => {
    const video = ref.current;
    if (video) video.muted = muted;
  }, [muted]);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    if (active && !paused) {
      const p = video.play();
      p?.catch((err: DOMException) => {
        // Geluid zonder tik mag niet: dan zonder geluid verder.
        if (err?.name === "NotAllowedError" && !video.muted) {
          onAutoplayBlocked();
          video.muted = true;
          video.play().catch(() => {});
        }
      });
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
    const sync = () => bar.set(video.currentTime, video.duration, !video.paused && video.readyState > 2);
    const onTime = () => {
      if (video.currentTime + 0.4 < last) sync(); // terug naar begin (loop)
      last = video.currentTime;
    };
    const onPlaying = () => {
      setShown(true);
      sync();
    };
    const onStop = () => bar.set(video.currentTime, video.duration, false);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("pause", onStop);
    video.addEventListener("waiting", onStop);
    video.addEventListener("seeked", sync);
    video.addEventListener("ratechange", sync);
    video.addEventListener("timeupdate", onTime);
    return () => {
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("pause", onStop);
      video.removeEventListener("waiting", onStop);
      video.removeEventListener("seeked", sync);
      video.removeEventListener("ratechange", sync);
      video.removeEventListener("timeupdate", onTime);
    };
  }, [bar]);

  return (
    <video
      ref={ref}
      className={`f-media ${shown ? "on" : ""}`}
      playsInline
      muted
      loop
      preload={active || preload ? "auto" : "metadata"}
      aria-label={v.titel}
      onError={kind === "mp4" ? onFail : undefined}
    />
  );
}

// ------------------------------------------------------------- YouTube (IFrame API via postMessage)
const YT_ORIGIN = "https://www.youtube-nocookie.com";
function YouTubePlayer({ v, id, active, paused, muted, bar }: PlayerProps & { id: string }) {
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
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [apply, bar]);

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

// ------------------------------------------------------------- één scherm
type SlideProps = {
  v: Video;
  i: number;
  total: number;
  cat: string;
  active: boolean;
  mount: boolean;
  preload: boolean;
  paused: boolean;
  muted: boolean;
  onTap: () => void;
  onClose: () => void;
  onAutoplayBlocked: () => void;
};
const Slide = memo(function Slide({ v, i, total, cat, active, mount, preload, paused, muted, onTap, onClose, onAutoplayBlocked }: SlideProps) {
  const p = playerFor(v);
  const [failed, setFailed] = useState(false);
  const fail = useCallback(() => setFailed(true), []);
  const barEl = useRef<HTMLSpanElement>(null);
  const bar = useBar(barEl);
  const [posterOk, setPosterOk] = useState(true);
  const playable = !!p && !failed;
  const props: PlayerProps = { v, active, preload, paused, muted, bar, onFail: fail, onAutoplayBlocked };
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
            <NativePlayer {...props} kind={p!.kind} src={p!.src} />
          )
        ) : null}
        {playable ? (
          <button type="button" className="ftap" aria-label={paused && active ? "Afspelen" : "Pauzeren"} onClick={onTap} tabIndex={-1}>
            {active && paused ? (
              <span className="fstate">
                <Icon name="play" className="fill" />
              </span>
            ) : null}
          </button>
        ) : (
          <div className="f-fail">
            <p>Dit filmpje speelt hier niet af.</p>
            <a className="f-btn" href={v.href} target="_blank" rel="noreferrer">
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
          <div className="f-actions">
            <a className="f-btn" href={v.href} target="_blank" rel="noreferrer">
              Open bij bron <Icon name="ext" className="sm" />
            </a>
            <button type="button" className="f-btn ghost" onClick={onClose}>
              Sluiten
            </button>
          </div>
        </div>
        <span className="f-bar" aria-hidden="true">
          <span ref={barEl} />
        </span>
      </div>
    </section>
  );
});

// ------------------------------------------------------------- de feed
export function Feed({ list, cat, start, onClose }: { list: Video[]; cat: "filmpjes" | "dumpert"; start: string | null; onClose: () => void }) {
  // Lijst vastzetten zolang de feed open is (de 15-minuten-verversing schuift dan niets onder je duim weg).
  const [items] = useState(list);
  const [first] = useState(() => Math.max(0, items.findIndex((v) => videoSlug(v) === start)));
  const [active, setActive] = useState(first);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(() => !soundOn());
  const [closing, setClosing] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const activeRef = useRef(active);
  activeRef.current = active;

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
  }, []);

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

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      try {
        sessionStorage.setItem(SOUND_KEY, next ? "0" : "1");
      } catch {
        /* privémodus */
      }
      return next;
    });
  }, []);
  const onTap = useCallback(() => setPaused((p) => !p), []);
  const onBlocked = useCallback(() => setMuted(true), []);

  const label = cat === "dumpert" ? "Dumpert" : "Filmpjes";
  return createPortal(
    <div className="app modal-root">
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
        <div className="feed-scroll" ref={scroller} tabIndex={-1}>
          {items.map((v, i) => (
            <Slide
              key={videoSlug(v) + i}
              v={v}
              i={i}
              total={items.length}
              cat={cat}
              active={i === active}
              mount={Math.abs(i - active) <= 1}
              preload={i === active + 1}
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
