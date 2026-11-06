// Gebaren van de videofeed: geluid aanzetten bij een tik en swipe-herstel (aanraking, scrollend).
import { useEffect } from "react";
import { bewaarMeting, swipeDoel, type SwipeMeting } from "./swipemeting";
import { slotVan } from "./videopool";
import { geluidTik, onthoudGeluidTik } from "./geluid";
import { debug as DEBUG } from "./debug";
import type { Pool, VideoMetFrames } from "./feed-speler";

type Ref<T> = React.MutableRefObject<T>;
export type GebarenCtx = {
  root: React.RefObject<HTMLDivElement>;
  scroller: React.RefObject<HTMLDivElement>;
  pool: Pool;
  soundRef: Ref<{ want: boolean; nativeBlocked: boolean; ytBlokAan: boolean }>;
  knopEersteOp: Ref<number>;
  vrijgegeven: Ref<WeakSet<HTMLVideoElement>>;
  unmutedAt: Ref<number>;
  aanraking: Ref<boolean>;
  activeRef: Ref<number>;
  richting: Ref<-1 | 1>;
  swipeStart: Ref<{ van: number; naar: number; speelde: boolean } | null>;
  lopendeMeting: Ref<SwipeMeting | null>;
  metingen: Ref<SwipeMeting[]>;
  setGetikt: (aan: boolean) => void;
  setBlocked: (aan: boolean) => void;
  unmuteNow: () => void;
  startDirect: (i: number) => void;
  herstel: () => void;
  ytBlokWis: () => void;
};

export function useGebaren({ root, scroller, pool, soundRef, knopEersteOp, vrijgegeven, unmutedAt, aanraking, activeRef, richting, swipeStart, lopendeMeting, metingen, setGetikt, setBlocked, unmuteNow, startDirect, herstel, ytBlokWis }: GebarenCtx) {
  useEffect(() => {
    const r = root.current;
    if (!r) return;
    const onGesture = (e: Event) => {
      if (!e.isTrusted) return;
      const eerste = !geluidTik();
      onthoudGeluidTik();
      setGetikt(true);
      const { want: w, nativeBlocked: b } = soundRef.current;
      if ((e.target as HTMLElement)?.closest?.(".f-sound")) { // die knop regelt het zelf
        // touchend/pointerup zetten de tikvlag vóór de click; onthoud dat dit de eerste tik was (niet overschrijven met false).
        if (eerste) knopEersteOp.current = Date.now();
        return;
      }
      if (e.type === "keydown" && /^m$/i.test((e as KeyboardEvent).key)) return; // M = geluid aan/uit
      if (w) {
        if (b || eerste) {
          // Geluid werd geweigerd of staat door deze tik pas aan: alle elementen (opnieuw) vrijgeven, tik pauzeert niet.
          if (b) vrijgegeven.current = new WeakSet();
          unmuteNow();
          unmutedAt.current = Date.now();
          setBlocked(false);
        } else unmuteNow(); // volgende video's blijven vrijgegeven
        ytBlokWis();
      }
    };
    let startY = 0;
    let gestart = false;
    const touchStart = (e: TouchEvent) => { aanraking.current = true; startY = e.changedTouches[0]?.clientY ?? 0; gestart = false; };
    const touchMove = (e: TouchEvent) => {
      if (gestart) return;
      const i = swipeDoel(startY, e.changedTouches[0]?.clientY ?? startY, activeRef.current);
      if (i === null) return;
      richting.current = i < activeRef.current ? -1 : 1;
      if (root.current?.querySelector(`.fslide[data-i="${activeRef.current}"] iframe.f-yt`)) return;
      const video = pool.els[slotVan(i)];
      if (Number(video.closest<HTMLElement>(".fslide")?.dataset.i) !== i || !video.getAttribute("src")) return;
      gestart = true;
      const huidig = pool.els[slotVan(activeRef.current)];
      swipeStart.current = { van: activeRef.current, naar: i, speelde: !huidig.paused && Number(huidig.closest<HTMLElement>(".fslide")?.dataset.i) === activeRef.current };
      if (DEBUG) {
        const m: SwipeMeting = { slide: i, gesture: performance.now() };
        lopendeMeting.current = m;
        bewaarMeting(metingen.current, m);
        (window as unknown as { __swipeMetingen: SwipeMeting[] }).__swipeMetingen = metingen.current;
        video.addEventListener("playing", () => { m.playing ??= performance.now(); }, { once: true });
        (video as VideoMetFrames).requestVideoFrameCallback?.(() => { m.frame ??= performance.now(); });
        const poster = video.closest(".fcol")?.querySelector(".f-poster");
        if (poster?.classList.contains("weg")) m.poster = performance.now();
        else if (poster) {
          const observer = new MutationObserver(() => { if (poster.classList.contains("weg")) { m.poster = performance.now(); observer.disconnect(); } });
          observer.observe(poster, { attributes: true, attributeFilter: ["class"] });
          window.setTimeout(() => observer.disconnect(), 5000);
        }
      }
      startDirect(i);
    };
    let herstelTimer: number | undefined;
    const touchEnd = (e: TouchEvent) => {
      aanraking.current = false;
      const doel = swipeDoel(startY, e.changedTouches[0]?.clientY ?? startY, swipeStart.current?.van ?? activeRef.current);
      if (doel === null || (swipeStart.current && doel !== swipeStart.current.naar)) herstel();
      if (doel !== null) startDirect(doel);
      window.clearTimeout(herstelTimer);
      herstelTimer = window.setTimeout(herstel, 1500);
    };
    const touchCancel = () => { aanraking.current = false; herstel(); };
    const scrollEnd = () => herstel();
    r.addEventListener("touchstart", touchStart, { passive: true });
    r.addEventListener("touchmove", touchMove, { passive: true });
    r.addEventListener("touchend", touchEnd, { passive: true });
    r.addEventListener("touchcancel", touchCancel, { passive: true });
    scroller.current?.addEventListener("scrollend", scrollEnd);
    const types = ["touchend", "pointerup", "click"];
    types.forEach((t) => r.addEventListener(t, onGesture, { capture: true, passive: true }));
    window.addEventListener("keydown", onGesture, { capture: true, passive: true });
    return () => {
      r.removeEventListener("touchstart", touchStart);
      r.removeEventListener("touchmove", touchMove);
      r.removeEventListener("touchend", touchEnd);
      r.removeEventListener("touchcancel", touchCancel);
      scroller.current?.removeEventListener("scrollend", scrollEnd);
      window.clearTimeout(herstelTimer);
      types.forEach((t) => r.removeEventListener(t, onGesture, { capture: true }));
      window.removeEventListener("keydown", onGesture, { capture: true });
    };
  }, [unmuteNow, startDirect, ytBlokWis]);
}
