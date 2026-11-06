// Bron koppelen aan het poolelement van de native speler: native HLS/mp4 of hls.js via onze proxy.
import { useEffect } from "react";
import { viaProxy } from "./videosoort";
import { dumpertRoute, isDumpertBron } from "./dumpertroute";
import { gebruiktNativeHls, maakBronvrij } from "./videopool";
import { niveauVan, planVoor } from "./buffer";
import { debug as DEBUG, debugEvent } from "./debug";
import type { Herstel, HlsRef, Pool } from "./feed-speler";
import { whenReady } from "./feed-speler";

type Ref<T> = React.MutableRefObject<T>;
export type BronCtx = {
  ref: React.RefObject<HTMLVideoElement>;
  gen: Ref<number>;
  pool: Pool;
  slot: number;
  kind: "hls" | "mp4";
  src: string;
  reloadKey: number;
  titel: string;
  onFail: () => void;
  herstel: Herstel;
  zetBeeld: (aan: boolean) => void;
  mutedRef: Ref<boolean>;
  pausedRef: Ref<boolean>;
  activeNow: Ref<boolean>;
  rankRef: Ref<number>;
  speelRef: Ref<() => void>;
  route: Ref<{ src: string; gewisseld: boolean }>;
  wisselRoute: Ref<(() => void) | null>;
  hlsRef: Ref<HlsRef | null>;
  started: Ref<boolean>;
  resumeAt: Ref<number>;
};

export function useBronKoppeling({ ref, gen, pool, slot, kind, src, reloadKey, titel, onFail, herstel, zetBeeld, mutedRef, pausedRef, activeNow, rankRef, speelRef, route, wisselRoute, hlsRef, started, resumeAt }: BronCtx) {
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
      hlsRef.current = h as unknown as HlsRef;
      h.on(Hls.Events.ERROR, (_e, d) => {
        if (DEBUG) console.log("[hls]", titel, d.type, d.details, d.fatal);
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
        h.on(Hls.Events.LEVEL_SWITCHED, (_e, d) => console.log("[hls] level", titel, d.level));
        h.on(Hls.Events.BUFFER_FLUSHING, (_e, d) => console.log("[hls] flush", titel, d.startOffset, d.endOffset, d.type));
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
}
