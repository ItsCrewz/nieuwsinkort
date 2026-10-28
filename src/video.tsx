import { useState } from "react";
import type { Video } from "./types";
import { BionicText } from "./ui";
import { Icon } from "./icons";
import { Feed, videoSlug } from "./feed";

type Player =
  | { kind: "youtube"; src: string }
  | { kind: "hls"; src: string }
  | { kind: "mp4"; src: string }
  | null;

export function youtubeId(url: string): string | null {
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
export function viaProxy(src: string): string {
  try {
    const u = new URL(src);
    if (u.hostname === "media.dumpert.nl") return `/media/dumpert${u.pathname}${u.search}`;
  } catch {
    /* laat staan */
  }
  return src;
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
      role="button"
      tabIndex={0}
      aria-label={playable ? `Speel af: ${v.titel}` : `${v.titel} (speelt alleen bij ${v.bron})`}
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
  const [first] = useState(enterProp); // alleen bij het eerste tonen
  const [touched, setTouched] = useState(false);
  const enter = first && !touched;
  const [bron, setBron] = useState("alle");
  const bronnen: string[] = [];
  for (const v of list) if (v.bron && !bronnen.includes(v.bron)) bronnen.push(v.bron);
  const shown = bron === "alle" || !bronnen.includes(bron) ? list : list.filter((v) => v.bron === bron);
  // De feed volgt het bron-chipje als de video daarin zit, anders de hele lijst (deep link).
  const feedList = video && shown.some((v) => videoSlug(v) === video) ? shown : list;
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
          <VideoCard key={v.href + i} v={v} i={i} cat={cat} bionic={bionic} enter={enter} onPlay={(x) => onOpen(videoSlug(x))} />
        ))}
      </div>
      {video ? <Feed key={cat} list={feedList} cat={cat} start={video} onClose={onCloseFeed} /> : null}
    </>
  );
}
