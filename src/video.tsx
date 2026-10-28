import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Video } from "./types";
import { BionicText } from "./ui";
import { Icon } from "./icons";

type Player =
  | { kind: "youtube"; src: string }
  | { kind: "hls"; src: string }
  | { kind: "mp4"; src: string }
  | null;

function youtubeId(url: string): string | null {
  const m =
    /youtube(?:-nocookie)?\.com\/(?:embed\/|shorts\/|live\/|watch\?(?:.*&)?v=)([\w-]{6,})/.exec(url) ||
    /youtu\.be\/([\w-]{6,})/.exec(url);
  return m ? m[1] : null;
}

export function playerFor(v: Video): Player {
  const e = v.embed || "";
  const yt = youtubeId(e) || youtubeId(v.href);
  if (yt) {
    return {
      kind: "youtube",
      src: `https://www.youtube-nocookie.com/embed/${yt}?autoplay=1&rel=0&playsinline=1&modestbranding=1`,
    };
  }
  if (/\.m3u8(\?|$)/i.test(e)) return { kind: "hls", src: e };
  if (/\.mp4(\?|$)/i.test(e)) return { kind: "mp4", src: e };
  return null;
}

// media.dumpert.nl staat geen andere sites toe (CORS). Native HLS (Safari/iOS) heeft daar geen last
// van; hls.js (Chrome/Firefox) haalt Dumpert via onze eigen proxy /media/dumpert/... (Pages Function).
function viaProxy(src: string): string {
  try {
    const u = new URL(src);
    if (u.hostname === "media.dumpert.nl") return `/media/dumpert${u.pathname}${u.search}`;
  } catch {
    /* laat staan */
  }
  return src;
}

function HlsVideo({ src, poster, onFail, label }: { src: string; poster?: string; onFail: () => void; label: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    let destroyed = false;
    let hls: { destroy: () => void } | null = null;
    // Safari/iOS: native HLS
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
      video.play().catch(() => {});
      return;
    }
    import("hls.js").then(({ default: Hls }) => {
      if (destroyed) return;
      if (!Hls.isSupported()) {
        onFail();
        return;
      }
      const h = new Hls({ enableWorker: true });
      hls = h;
      h.on(Hls.Events.ERROR, (_e, data) => {
        if (data.fatal) onFail();
      });
      h.loadSource(viaProxy(src));
      h.attachMedia(video);
      h.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {});
      });
    });
    return () => {
      destroyed = true;
      hls?.destroy();
    };
  }, [src, onFail]);
  return <video ref={ref} poster={poster || undefined} controls playsInline preload="metadata" aria-label={label} />;
}

const motionOK = () => !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function popIcon(p: string) {
  return /weergaven|views/i.test(p) ? "eye" : "up";
}

export function VideoModal({ v, cat, onClose }: { v: Video; cat: string; onClose: () => void }) {
  const p = playerFor(v);
  const [failed, setFailed] = useState(false);
  const [closing, setClosing] = useState(false);
  const fail = useCallback(() => setFailed(true), []);
  const close = useCallback(() => {
    if (!motionOK()) return onClose();
    setClosing(true);
    window.setTimeout(onClose, 190);
  }, [onClose]);
  const closeBtn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeBtn.current?.focus({ preventScroll: true });
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [close]);
  const isShort = /\/shorts\//.test(v.href) && p?.kind === "youtube";
  // Via een portal naar <body>: .shell heeft container-type (layout containment), dat breekt position:fixed.
  return createPortal(
    <div className="app modal-root">
    <div className={`modal ${closing ? "out" : ""}`} role="dialog" aria-modal="true" aria-label={`Videospeler: ${v.titel}`}>
      <button className="backdrop" aria-label="Sluit de speler" onClick={close} tabIndex={-1} />
      <div className={`panel cat-${cat}`}>
        <div className={`player ${isShort ? "short" : ""}`}>
          {!p || failed ? (
            <div className="p-fail">
              Dit filmpje speelt hier helaas niet af.
              <a href={v.href} target="_blank" rel="noreferrer">
                Open bij {v.bron} ↗
              </a>
            </div>
          ) : p.kind === "youtube" ? (
            <iframe
              src={p.src}
              title={v.titel}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
            />
          ) : p.kind === "hls" ? (
            <HlsVideo src={p.src} poster={v.thumb} onFail={fail} label={v.titel} />
          ) : (
            <video
              src={p.src}
              poster={v.thumb || undefined}
              controls
              autoPlay
              playsInline
              preload="metadata"
              aria-label={v.titel}
              onError={() => setFailed(true)}
            />
          )}
        </div>
        <div className="pinfo">
          <div className="pinfo-main">
            <h2 className="p-title">{v.titel}</h2>
            <div className="v-meta" style={{ justifyContent: "flex-start", gap: "8px 16px" }}>
              <span className="v-src"><i />{v.bron}</span>
              {v.populariteit ? (
                <span className="v-pop"><Icon name={popIcon(v.populariteit)} className="sm" />{v.populariteit}</span>
              ) : null}
              {v.tijd ? <span className="v-time">{v.tijd}</span> : null}
            </div>
            <p className="note">
              Speelt het niet af?{" "}
              <a href={v.href} target="_blank" rel="noreferrer">
                Open het bij {v.bron}
              </a>
              .
            </p>
          </div>
          <button ref={closeBtn} className="iconbtn" aria-label="Sluit de speler" onClick={close}>
            <Icon name="x" />
          </button>
        </div>
      </div>
    </div>
    </div>,
    document.body
  );
}

// Kleurverloop als er geen (werkende) thumbnail is, zoals in het design.
function hueOf(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}
function thumbBg(seed: string) {
  const h1 = hueOf(seed);
  const h2 = (h1 + 40) % 360;
  return `radial-gradient(120% 90% at 15% 0%, oklch(0.8 0.13 ${h1}) 0%, transparent 58%), radial-gradient(90% 90% at 95% 100%, oklch(0.6 0.16 ${h2}) 0%, transparent 62%), linear-gradient(160deg, oklch(0.46 0.1 ${h1}), oklch(0.3 0.08 ${h2}))`;
}

function VideoCard({ v, i, cat, bionic, onPlay }: { v: Video; i: number; cat: string; bionic: boolean; onPlay: (v: Video) => void }) {
  const [failed, setFailed] = useState(false);
  const playable = !!playerFor(v);
  const activate = () => {
    if (playable) onPlay(v);
    else window.open(v.href, "_blank", "noreferrer");
  };
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={playable ? `Speel af: ${v.titel}` : `${v.titel} (opent bij ${v.bron})`}
      onClick={activate}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          activate();
        }
      }}
      className={`card vcard cat-${cat} fade`}
      style={{ animationDelay: `${Math.min(i, 9) * 45}ms` }}
    >
      <div className="vthumb" style={{ background: thumbBg(v.bron + v.titel) }}>
        {v.thumb && !failed ? (
          <img src={v.thumb} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
        ) : null}
        <span className="playbtn">
          <Icon name={playable ? "play" : "ext"} className={playable ? "fill" : ""} />
        </span>
      </div>
      <div className="vbody">
        <h3 className="v-title">{v.titel}</h3>
        {v.ai ? (
          <p className="v-ai bn">
            <BionicText text={v.ai} on={bionic} />
          </p>
        ) : null}
        <div className="v-meta">
          <span className="v-src"><i />{v.bron}</span>
          {v.tijd ? <span className="v-time">{v.tijd}</span> : null}
        </div>
        <div className="v-meta">
          {v.populariteit ? (
            <span className="v-pop"><Icon name={popIcon(v.populariteit)} className="sm" />{v.populariteit}</span>
          ) : <span />}
          <a href={v.href} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="v-ext">
            Open bij bron <Icon name="ext" className="sm" />
          </a>
        </div>
      </div>
    </div>
  );
}

export function VideoGrid({ list, cat, bionic, bronFilter }: { list: Video[]; cat: "filmpjes" | "dumpert"; bionic: boolean; bronFilter: boolean }) {
  const [bron, setBron] = useState("alle");
  const [playing, setPlaying] = useState<Video | null>(null);
  const bronnen: string[] = [];
  for (const v of list) if (v.bron && !bronnen.includes(v.bron)) bronnen.push(v.bron);
  const shown = bron === "alle" ? list : list.filter((v) => v.bron === bron);
  if (list.length === 0) {
    return (
      <div className="card empty fade">
        <Icon name="film" />
        {cat === "dumpert" ? "Nog geen Dumpert-filmpjes vandaag." : "Nog geen filmpjes vandaag."} Kom straks nog eens kijken.
      </div>
    );
  }
  return (
    <>
      {bronFilter && bronnen.length > 1 ? (
        <div className="chips" role="group" aria-label="Filter op bron">
          {["alle", ...bronnen].map((b) => (
            <button key={b} type="button" className="chip" aria-pressed={bron === b} onClick={() => setBron(b)}>
              {b === "alle" ? "Alle bronnen" : b}
              <span>{b === "alle" ? list.length : list.filter((v) => v.bron === b).length}</span>
            </button>
          ))}
        </div>
      ) : null}
      <div className="grid" key={bron}>
        {shown.map((v, i) => (
          <VideoCard key={v.href + i} v={v} i={i} cat={cat} bionic={bionic} onPlay={setPlaying} />
        ))}
      </div>
      {playing ? <VideoModal v={playing} cat={cat} onClose={() => setPlaying(null)} /> : null}
    </>
  );
}
