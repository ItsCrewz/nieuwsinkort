// YouTube-speler (IFrame API via postMessage) voor de videofeed.
import { useCallback, useEffect, useRef, useState } from "react";
import { debugEvent } from "./debug";
import { ytStartBesluit, ytEchteFout, autoplayGeblokkeerd, ytEmbedUrl } from "./ytstart";
import type { SeekApi } from "./feed-balk";
import type { PlayerProps } from "./feed-speler";

// ------------------------------------------------------------- YouTube (IFrame API via postMessage)
export const YT_ORIGIN = "https://www.youtube-nocookie.com";
export function YouTubePlayer({ v, id, active, paused, muted, bar, seek, onBeeld, onAutoplayBlocked, vangnet, setVangnet, onYtFout, onYtSpeelt }: PlayerProps & { id: string; vangnet: boolean; setVangnet: (aan: boolean) => void; onYtFout: (code: unknown) => void; onYtSpeelt: () => void }) {
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
          blokkade.current = "timeout"; // alleen de hint; geen echte weigering, dus niet dempen
          diagnose();
        }
        setVangnet(true);
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, [apply, diagnose, listening, post, setVangnet]);

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
