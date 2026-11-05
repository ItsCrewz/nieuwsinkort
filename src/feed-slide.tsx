// Eén scherm van de videofeed: speler, poster, bediening en info.
import { memo, useCallback, useEffect, useRef, useState } from "react";
import type { Video } from "./types";
import { Icon } from "./icons";
import { playerFor, viaProxy, youtubeId } from "./videosoort";
import { veiligeUrl } from "./url";
import { slotVan } from "./videopool";
import { posterVerborgen } from "./poster";
import { geluidVoorSlide } from "./ytstart";
import { useBar, Scrub, type SeekApi } from "./feed-balk";
import type { PlayerProps, Pool } from "./feed-speler";
import { NativePlayer } from "./feed-native";
import { YouTubePlayer } from "./feed-youtube";
import { SamenvattingKnop } from "./feed-samenvatting";

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
  want: boolean;
  getikt: boolean;
  nativeBlocked: boolean;
  ytBlocked: boolean;
  onTap: () => void;
  onClose: () => void;
  onAutoplayBlocked: () => void;
  onYtBlok: (i: number) => void;
  onYtFout: (i: number, code: unknown) => void;
  onYtSpeelt: () => void;
};
export const Slide = memo(function Slide({ pool, v, i, total, cat, active, mount, preload, paused, want, getikt, nativeBlocked, ytBlocked, onTap, onClose, onAutoplayBlocked, onYtBlok, onYtFout, onYtSpeelt }: SlideProps) {
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
  // Geluid per bron: een YouTube-blokkade geldt alleen voor deze slide, nooit voor de poolvideo's.
  const ytBlokkeer = useCallback(() => onYtBlok(i), [i, onYtBlok]);
  const muted = !geluidVoorSlide(p?.kind ?? "", want, getikt, nativeBlocked, ytBlocked);
  const props: PlayerProps = { v, active, preload, paused, muted, bar, seek, onFail: fail, onAutoplayBlocked: p?.kind === "youtube" ? ytBlokkeer : onAutoplayBlocked, onBeeld: setBeeld };
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
            src={viaProxy(v.thumb)}
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
            {v.gisteren ? <span>gisteren</span> : null}
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
