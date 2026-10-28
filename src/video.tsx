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
  // De speler (iframe/hls) pas laden als het paneel staat: anders concurreert het laden met de animatie.
  const [ready, setReady] = useState(() => !motionOK());
  const fail = useCallback(() => setFailed(true), []);
  const panel = useRef<HTMLDivElement>(null);
  const close = useCallback(() => {
    if (!motionOK()) return onClose();
    setClosing(true);
    window.setTimeout(onClose, 320); // vangnet als animationend niet komt
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
    const t = window.setTimeout(() => setReady(true), 320); // vangnet als animationend niet komt
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      window.clearTimeout(t);
    };
  }, [close]);
  const isShort = /\/shorts\//.test(v.href) && p?.kind === "youtube";
  // Via een portal naar <body>: .shell heeft container-type (layout containment), dat breekt position:fixed.
  return createPortal(
    <div className="app modal-root">
    <div className={`modal ${closing ? "out" : ""}`} role="dialog" aria-modal="true" aria-label={`Videospeler: ${v.titel}`}>
      <button className="backdrop" aria-label="Sluit de speler" onClick={close} tabIndex={-1} />
      <div
        ref={panel}
        className={`panel cat-${cat}`}
        onAnimationEnd={(e) => {
          if (e.target !== panel.current) return;
          if (closing) onClose();
          else setReady(true);
        }}
      >
        <div className={`player ${isShort ? "short" : ""}`}>
          {!p || failed ? (
            <div className="p-fail">
              Dit filmpje speelt hier helaas niet af.
              <a href={v.href} target="_blank" rel="noreferrer">
                Open bij {v.bron} ↗
              </a>
            </div>
          ) : !ready ? (
            v.thumb ? <img className="p-poster" src={v.thumb} alt="" referrerPolicy="no-referrer" decoding="async" /> : null
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
            <div className="kicker"><i className="mk" />{v.bron}{v.tijd ? <time className="tnum">{v.tijd}</time> : null}</div>
            <h2 className="p-title">{v.titel}</h2>
            <p className="note">
              {v.populariteit ? <span className="tnum">{v.populariteit} · </span> : null}
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

function VideoCard({ v, i, cat, bionic, enter, onPlay }: { v: Video; i: number; cat: string; bionic: boolean; enter: boolean; onPlay: (v: Video) => void }) {
  const [failed, setFailed] = useState(false);
  const playable = !!playerFor(v);
  const activate = () => {
    if (playable) onPlay(v);
    else window.open(v.href, "_blank", "noreferrer");
  };
  const anim = enter && i < 12;
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
      className={`vcard cat-${cat} ${anim ? "enter" : ""}`}
      style={anim ? ({ "--i": i } as React.CSSProperties) : undefined}
    >
      <div className="vthumb">
        {v.thumb && !failed ? (
          <img src={v.thumb} alt="" width={640} height={360} loading={i < 4 ? "eager" : "lazy"} decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
        ) : (
          <span className="vthumb-name">{v.bron}</span>
        )}
        <span className="playbtn">
          <Icon name={playable ? "play" : "ext"} className={playable ? "fill" : ""} />
        </span>
      </div>
      <div className="vbody">
        <div className="kicker">
          <i className="mk" />
          {v.bron}
          {v.tijd ? <time className="tnum">{v.tijd}</time> : null}
        </div>
        <h3 className="v-title">{v.titel}</h3>
        {v.ai ? (
          <p className="v-ai bn">
            <BionicText text={v.ai} on={bionic} />
          </p>
        ) : null}
        <div className="v-meta">
          {v.populariteit ? (
            <span className="v-pop tnum"><Icon name={popIcon(v.populariteit)} className="sm" />{v.populariteit}</span>
          ) : <span />}
          <a href={v.href} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="v-ext">
            Open bij bron <Icon name="ext" className="sm" />
          </a>
        </div>
      </div>
    </div>
  );
}

export function VideoGrid({ list, cat, bionic, bronFilter, enter: enterProp }: { list: Video[]; cat: "filmpjes" | "dumpert"; bionic: boolean; bronFilter: boolean; enter: boolean }) {
  const [first] = useState(enterProp); // alleen bij het eerste tonen
  const [touched, setTouched] = useState(false);
  const enter = first && !touched;
  const [bron, setBron] = useState("alle");
  const [playing, setPlaying] = useState<Video | null>(null);
  const bronnen: string[] = [];
  for (const v of list) if (v.bron && !bronnen.includes(v.bron)) bronnen.push(v.bron);
  const shown = bron === "alle" || !bronnen.includes(bron) ? list : list.filter((v) => v.bron === bron);
  if (list.length === 0) {
    return (
      <div className="empty">
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
            <button key={b} type="button" className="chip" aria-pressed={bron === b || (b === "alle" && !bronnen.includes(bron))} onClick={() => {
              setTouched(true);
              setBron(b);
            }}>
              {b === "alle" ? "Alle" : b}
              <span className="tnum">{b === "alle" ? list.length : list.filter((v) => v.bron === b).length}</span>
            </button>
          ))}
        </div>
      ) : null}
      <div className={`vgrid ${enter ? "" : "swap"}`} key={bron}>
        {shown.map((v, i) => (
          <VideoCard key={v.href + i} v={v} i={i} cat={cat} bionic={bionic} enter={enter} onPlay={setPlaying} />
        ))}
      </div>
      {playing ? <VideoModal v={playing} cat={cat} onClose={() => setPlaying(null)} /> : null}
    </>
  );
}
