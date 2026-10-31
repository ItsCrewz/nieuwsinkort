import { Suspense, lazy, useEffect, useRef, useState } from "react";
import type { Soort, Video } from "./types";
import { BionicText } from "./ui";
import { Icon } from "./icons";
import { videoSlug } from "./slug";
import { SOORTEN, playerFor, soortVan, startSoort, viaProxy } from "./videosoort";
import { veiligeUrl } from "./url";
import { bewaarFeed, herstelFeed, leesFeed, wisFeed } from "./feedstatus";
import { touchNu, volgTouch } from "./invoer";

// De volledige videofeed (spelers, hls.js-glue, debug-overlay) is een eigen chunk: pas laden op touch + videoroute.
const Feed = lazy(() => import("./feed").then((m) => ({ default: m.Feed })));

/** Touch (swipe-feed) of muis/trackpad (kopjes en kaarten); volgt wijzigingen van de mediaquery. */
export function useTouch(): boolean {
  const [touch, setTouch] = useState(touchNu);
  useEffect(() => {
    setTouch(touchNu());
    return volgTouch(typeof window !== "undefined" ? window.matchMedia?.bind(window) : null, setTouch);
  }, []);
  return touch;
}

function popIcon(p: string) {
  return /weergaven|views/i.test(p) ? "eye" : "up";
}

function VideoCard({ v, i, cat, bionic, enter, onPlay }: { v: Video; i: number; cat: string; bionic: boolean; enter: boolean; onPlay: (v: Video) => void }) {
  const [failed, setFailed] = useState(false);
  const playable = !!playerFor(v);
  const activate = () => onPlay(v);
  const anim = enter && i < 12;
  return (
    <div
      className={`vcard cat-${cat} ${anim ? "enter" : ""}`}
      style={anim ? ({ "--i": i } as React.CSSProperties) : undefined}
    >
      <button type="button" className="vcard-open" aria-label={playable ? `Speel af: ${v.titel}` : `${v.titel} (speelt alleen bij ${v.bron})`} onClick={activate} />
      <div className={`vthumb ${cat === "filmpjes" && soortVan(v) === "short" ? "tall" : ""}`}>
        {v.thumb && !failed ? (
          <img src={viaProxy(v.thumb)} alt="" aria-hidden="true" width={640} height={360} loading={i < 4 ? "eager" : "lazy"} decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
        ) : (
          <span className="vthumb-name">{v.bron}</span>
        )}
        <span className="playbtn">
          <Icon name={playable ? "play" : "ext"} className={playable ? "fill" : ""} />
        </span>
      </div>
      <div className="vbody">
        <div className="meta">
          {v.bron}
          {v.tijd ? <time className="tnum">{v.tijd}</time> : null}
        </div>
        <h2 className="v-title">{v.titel}</h2>
        {v.ai ? (
          <p className="v-ai bn">
            <BionicText text={v.ai} on={bionic} />
          </p>
        ) : null}
        <div className="v-meta">
          {v.populariteit ? (
            <span className="v-pop tnum"><Icon name={popIcon(v.populariteit)} className="sm" />{v.populariteit}</span>
          ) : <span />}
          <a href={veiligeUrl(v.href)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="v-ext">
            Open bij bron <Icon name="ext" className="sm" />
          </a>
        </div>
      </div>
    </div>
  );
}

export function VideoGrid({
  list,
  cat,
  bionic,
  bronFilter,
  enter: enterProp,
  video,
  onOpen,
  onCloseFeed,
}: {
  list: Video[];
  cat: "filmpjes" | "dumpert";
  bionic: boolean;
  bronFilter: boolean;
  enter: boolean;
  video: string | null;
  onOpen: (slug: string) => void;
  onCloseFeed: () => void;
}) {
  const touch = useTouch();
  const opgeslagen = useRef(leesFeed());
  const vast = useRef<Video[] | null>(null);
  if (!video) vast.current = null;
  else if (!vast.current) vast.current = herstelFeed(opgeslagen.current, cat, video, list).lijst;
  const feedVideos = vast.current ?? list;
  const start = video ? herstelFeed(opgeslagen.current, cat, video, feedVideos).slug : null;
  useEffect(() => {
    if (!touch) return;
    if (!video) { wisFeed(); return; }
    let vorigeSlug = "";
    let positie = 0;
    let speelt = true;
    let hervat = false;
    let hersteld = false;
    const saved = opgeslagen.current;
    const actief = () => document.querySelector<HTMLElement>('.feed .fslide[aria-current="true"]');
    const frame = () => actief()?.querySelector<HTMLIFrameElement>('iframe.f-yt');
    const stuur = (func: string, args: unknown[] = []) => frame()?.contentWindow?.postMessage(JSON.stringify({ event: "command", func, args }), "https://www.youtube-nocookie.com");
    const update = () => {
      const slug = decodeURIComponent(location.hash.split("/").slice(2).join("/")) || start || video;
      if (slug !== vorigeSlug) { vorigeSlug = slug; positie = 0; hersteld = false; }
      const el = actief()?.querySelector<HTMLVideoElement>("video");
      if (!hersteld && slug === saved?.slug && saved.cat === cat) {
        if (el && el.readyState > 0) { try { el.currentTime = saved.positie || 0; } catch { /* nog niet zoekbaar */ } hersteld = true; }
        else if (frame()) { stuur("seekTo", [saved.positie || 0, true]); hersteld = true; }
      }
      if (el) { positie = el.currentTime || 0; if (document.visibilityState === "visible") speelt = !el.paused; }
      const item = feedVideos.find((v) => videoSlug(v) === slug);
      bewaarFeed({ cat, slug, soort: item ? soortVan(item) : "short", positie, speelt, lijst: feedVideos });
    };
    const bericht = (e: MessageEvent) => {
      if (e.origin !== "https://www.youtube-nocookie.com" || e.source !== frame()?.contentWindow) return;
      try { const d = typeof e.data === "string" ? JSON.parse(e.data) : e.data; if (typeof d?.info?.currentTime === "number") positie = d.info.currentTime; if (document.visibilityState === "visible" && typeof d?.info?.playerState === "number") speelt = d.info.playerState === 1; } catch { /* onbekend bericht */ }
    };
    let verborgen = false;
    const verberg = () => { if (verborgen) return; verborgen = true; update(); hervat = speelt; actief()?.querySelector<HTMLVideoElement>("video")?.pause(); stuur("pauseVideo"); };
    const toon = () => { if (!verborgen) return; verborgen = false; if (hervat) { actief()?.querySelector<HTMLVideoElement>("video")?.play().catch(() => {}); stuur("playVideo"); } hervat = false; };
    const zicht = () => document.visibilityState === "hidden" ? verberg() : toon();
    document.addEventListener("visibilitychange", zicht);
    window.addEventListener("pagehide", verberg); window.addEventListener("pageshow", toon); window.addEventListener("message", bericht);
    const timer = window.setInterval(update, 500); update();
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", zicht); window.removeEventListener("pagehide", verberg); window.removeEventListener("pageshow", toon); window.removeEventListener("message", bericht); };
  }, [video, cat, feedVideos, start, touch]);
  const [first] = useState(enterProp); // alleen bij het eerste tonen
  const [touched, setTouched] = useState(false);
  const enter = first && !touched;
  const split = cat === "filmpjes";
  // Filmpjes: Shorts en Journaals apart. Een deep link naar een journaal opent meteen het tabje Journaals.
  const [soort, setSoort] = useState<Soort>(() => {
    const hit = video ? list.find((v) => videoSlug(v) === video) : null;
    return hit ? soortVan(hit) : startSoort(list);
  });
  const [bron, setBron] = useState("alle");
  const perSoort = (s: Soort) => (split ? list.filter((v) => soortVan(v) === s) : list);
  const sub = perSoort(soort);
  const bronnen: string[] = [];
  for (const v of sub) if (v.bron && !bronnen.includes(v.bron)) bronnen.push(v.bron);
  const byBron = (l: Video[]) => (bron === "alle" || !bronnen.includes(bron) ? l : l.filter((v) => v.bron === bron));
  const shown = byBron(sub);
  // De feed volgt het bron-chipje als de video daarin zit, anders de hele lijst (deep link).
  const geselecteerd = split ? feedVideos.filter((v) => soortVan(v) === soort) : feedVideos;
  const feedList = geselecteerd.some((v) => videoSlug(v) === start) ? geselecteerd : feedVideos;
  const groups = split
    ? SOORTEN.map((s) => {
        const l = feedVideos.filter((v) => soortVan(v) === s.id);
        const f = s.id === soort ? byBron(l) : l;
        return { id: s.id, label: s.label, list: f.length ? f : l };
      }).filter((g) => g.list.length)
    : undefined;
  if (list.length === 0 && !video) {
    return (
      <div className="empty">
        <Icon name="film" />
        {cat === "dumpert" ? "Nog geen Dumpert-filmpjes vandaag." : "Nog geen filmpjes vandaag."} Kom straks nog eens kijken.
      </div>
    );
  }
  return (
    <>
      {split ? (
        <div className="vseg" role="tablist" aria-label="Soort filmpjes">
          {SOORTEN.map((s) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={soort === s.id}
              aria-controls="video-paneel"
              onClick={() => {
                if (soort === s.id) return;
                setTouched(true);
                setBron("alle");
                setSoort(s.id);
              }}
            >
              {s.label}
              <span className="tnum">{perSoort(s.id).length}</span>
            </button>
          ))}
        </div>
      ) : null}
      <div id="video-paneel" role="tabpanel">
      {bronFilter && bronnen.length > 1 ? (
        <div className="chips" role="group" aria-label="Filter op bron">
          {["alle", ...bronnen].map((b) => (
            <button key={b} type="button" className="chip" aria-pressed={bron === b || (b === "alle" && !bronnen.includes(bron))} onClick={() => {
              setTouched(true);
              setBron(b);
            }}>
              {b === "alle" ? "Alle" : b}
              <span className="tnum">{b === "alle" ? sub.length : sub.filter((v) => v.bron === b).length}</span>
            </button>
          ))}
        </div>
      ) : null}
      {shown.length ? (
        <div className={`vgrid ${enter ? "" : "swap"}`} key={`${soort}-${bron}`}>
          {shown.map((v, i) => (
            <VideoCard key={v.href + i} v={v} i={i} cat={cat} bionic={bionic} enter={enter} onPlay={(x) => (touch ? onOpen(videoSlug(x)) : window.open(veiligeUrl(x.href), "_blank", "noopener,noreferrer"))} />
          ))}
        </div>
      ) : (
        <div className="empty" key={soort}>
          <Icon name="film" />
          {SOORTEN.find((s) => s.id === soort)?.leeg} Kom straks nog eens kijken.
        </div>
      )}
      </div>
      {video && touch ? (
        <Suspense fallback={null}>
          <Feed
            key={cat}
            list={feedList}
            cat={cat}
            start={start}
            onClose={onCloseFeed}
            groups={groups}
            onGroup={(g) => {
              setBron("alle");
              setSoort(g as Soort);
            }}
          />
        </Suspense>
      ) : null}
    </>
  );
}
