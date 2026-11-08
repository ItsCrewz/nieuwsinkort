// TikTok-achtige verticale feed voor Filmpjes en Dumpert.
// - Eén video per scherm, CSS scroll-snap (y mandatory); swipen, scrollen, pijltjes of J/K.
// - Alleen huidige ±1 heeft een speler; de volgende wordt vooraf geladen, de rest is alleen een poster.
// - Actieve video via IntersectionObserver (60%); die speelt (standaard zonder geluid), de rest pauzeert.
// - Voortgangsbalk via de Web Animations API op transform: loopt op de compositor, geen JS per frame.
import { herstelSwipe, type SwipeMeting } from "./swipemeting";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import type { Video } from "./types";
import { Icon } from "./icons";
import { rustig, scrollGedrag } from "./beweging";
import { maakSluiter } from "./feedsluiten";
import { playerFor } from "./videosoort";
import { tabToets } from "./tabs";
export { videoSlug } from "./slug";
import { videoSlug } from "./slug";
import { bronIndexen, maakBronvrij, slotVan } from "./videopool";
import { ytVerwijderBesluit, geluidMag, geluidVoorSlide } from "./ytstart";
import { debug as DEBUG } from "./debug";
import { DebugOverlay } from "./debug-overlay";
import { soundOn, saveSound, geluidTik, onthoudGeluidTik } from "./geluid";
import { maakPool } from "./feed-speler";
import { Slide } from "./feed-slide";
import { YT_ORIGIN } from "./feed-youtube";
import { useGebaren } from "./feed-gebaren";

// ------------------------------------------------------------- de feed
export type FeedGroup = { id: string; label: string; list: Video[] };
export function Feed({
  list,
  cat,
  start,
  onClose,
  groups,
  onGroup,
}: {
  list: Video[];
  cat: "filmpjes" | "dumpert";
  start: string | null;
  onClose: () => void;
  groups?: FeedGroup[];
  onGroup?: (id: string) => void;
}) {
  // Lijsten vastzetten zolang de feed open is (de 15-minuten-verversing schuift dan niets onder je duim weg).
  const [gs] = useState(() => (groups && groups.length > 1 ? groups : null));
  const [gi, setGi] = useState(() => {
    if (!gs) return 0;
    const k = gs.findIndex((g) => g.list.some((v) => videoSlug(v) === start));
    return k < 0 ? 0 : k;
  });
  const [items, setItems] = useState(() => (gs ? gs[gi].list : list));
  const [first] = useState(() => Math.max(0, items.findIndex((v) => videoSlug(v) === start)));
  const [active, setActive] = useState(first);
  // Wisselen tussen Shorts en Journaals: nieuwe lijst, vanaf de eerste video (de scroller wordt vers opgebouwd).
  const pickGroup = useCallback(
    (k: number) => {
      if (!gs || k === gi) return;
      setGi(k);
      setItems(gs[k].list);
      setActive(0);
      setPaused(false);
      onGroup?.(gs[k].id);
    },
    [gs, gi, onGroup]
  );
  const [paused, setPaused] = useState(false);
  // want = jouw keuze (onthouden); nativeBlocked = de browser weigerde geluid op een poolvideo (Dumpert, Instagram);
  // ytBlok = YouTube-slides die geluid weigerden (per slide, dempt nooit een native slide).
  const [want, setWant] = useState(soundOn);
  const [nativeBlocked, setBlocked] = useState(false);
  const [getikt, setGetikt] = useState(geluidTik);
  const [ytBlok, setYtBlok] = useState<ReadonlySet<number>>(() => new Set());
  const ytBlokAan = useCallback((i: number) => setYtBlok((s) => (s.has(i) ? s : new Set(s).add(i))), []);
  const ytBlokWis = useCallback(() => setYtBlok((s) => (s.size ? new Set() : s)), []);
  const activeKind = playerFor(items[active])?.kind ?? "";
  const muted = !geluidVoorSlide(activeKind, want, getikt, nativeBlocked, ytBlok.has(active));
  const unmutedAt = useRef(0);
  const [closing, setClosing] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  // Spelers: de pool heeft 3 vaste <video>'s voor slide i-1, i en i+1; welke daarvan een bron krijgen bepaalt
  // videopool.ts (actief + volgende). YouTube-iframes blijven per
  // slide (actief + volgende) buiten de pool.
  const [pool] = useState(maakPool);
  const mounted = useMemo(() => {
    const next = bronIndexen(active, items.length);
    for (let i = active; i <= active + 1; i++) if (i >= 0 && i < items.length && playerFor(items[i])?.kind === "youtube") next.add(i);
    return next;
  }, [active, items]);
  // Geparkeerde pool-elementen blijven in het document (overlay, iOS-gebruiksstatus); weg als de feed sluit.
  useLayoutEffect(() => {
    const r = root.current;
    r?.appendChild(pool.park);
    return () => {
      pool.park.remove();
      pool.els.forEach((el) => maakBronvrij(el));
    };
  }, [pool]);

  // Sluiten gebeurt precies één keer (timer én animationend, dubbel tikken, herhaald Escape); timer opruimen bij verdwijnen.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [sluiter] = useState(() => maakSluiter({ rustig, start: () => setClosing(true), onClose: () => onCloseRef.current() }));
  useEffect(() => sluiter.opruimen, [sluiter]);
  const rondAf = sluiter.rondAf;
  const close = sluiter.sluit;

  const metingen = useRef<SwipeMeting[]>([]);
  const lopendeMeting = useRef<SwipeMeting | null>(null);
  const swipeStart = useRef<{ van: number; naar: number; speelde: boolean } | null>(null);
  const herstel = useCallback(() => {
    const poging = swipeStart.current;
    if (!poging) return;
    swipeStart.current = null;
    if (!herstelSwipe(poging.van, poging.naar, activeRef.current)) return;
    const volgend = pool.els[slotVan(poging.naar)];
    if (Number(volgend.closest<HTMLElement>(".fslide")?.dataset.i) === poging.naar) {
      volgend.pause();
      try { volgend.currentTime = 0; } catch {}
    }
    const huidig = pool.els[slotVan(poging.van)];
    if (poging.speelde && !pausedRef.current && Number(huidig.closest<HTMLElement>(".fslide")?.dataset.i) === poging.van) huidig.play().catch(() => {});
  }, [pool]);
  const startDirect = useCallback((i: number) => {
    const video = pool.els[slotVan(i)];
    const slide = video.closest<HTMLElement>(".fslide");
    if (!slide || Number(slide.dataset.i) !== i || !video.getAttribute("src")) return;
    // Eerst de uitgaande speler stil, dan pas de inkomende starten: nooit twee decoders tegelijk aan het spelen.
    const vorige = activeRef.current;
    const uitIframe = i !== vorige ? root.current?.querySelector<HTMLIFrameElement>(`.fslide[data-i="${vorige}"] iframe.f-yt`) : null;
    uitIframe?.contentWindow?.postMessage(JSON.stringify({ event: "command", func: "pauseVideo", args: [] }), YT_ORIGIN);
    const uit = i !== vorige ? pool.els[slotVan(vorige)] : null;
    const uitSlide = uit?.closest<HTMLElement>(".fslide") ?? null;
    const uitSpeelde = !!uit && !uit.paused && Number(uitSlide?.dataset.i) === vorige;
    if (uitSpeelde) uit!.pause();
    video.muted = !geluidMag(soundRef.current.want, geluidTik(), soundRef.current.nativeBlocked);
    if (lopendeMeting.current?.slide === i && lopendeMeting.current.play === undefined) lopendeMeting.current.play = performance.now();
    video.play().catch((err: DOMException) => {
      if (err?.name === "NotAllowedError") {
        video.dataset.autoplayBlokkade = "NotAllowedError";
        if (!video.muted) { setBlocked(true); video.muted = true; video.play().catch(() => {}); }
      }
    });
    if (i !== vorige && swipeStart.current?.naar !== i) window.setTimeout(() => {
      if (i === activeRef.current) return;
      if (video.closest<HTMLElement>(".fslide") === slide) video.pause();
      // Swipe ging niet door: de vorige speelt verder.
      if (uitIframe && activeRef.current === vorige && !pausedRef.current) uitIframe.contentWindow?.postMessage(JSON.stringify({ event: "command", func: "playVideo", args: [] }), YT_ORIGIN);
      if (uitSpeelde && activeRef.current === vorige && !pausedRef.current && uit!.closest<HTMLElement>(".fslide") === uitSlide) uit!.play().catch(() => {});
    }, 1500);
  }, [pool]);

  const richting = useRef<-1 | 1>(1);
  const aanraking = useRef(false);
  const go = useCallback((i: number) => {
    const s = scroller.current;
    if (!s) return;
    const n = Math.max(0, Math.min(items.length - 1, i));
    if (n !== activeRef.current) richting.current = n < activeRef.current ? -1 : 1;
    startDirect(n);
    s.scrollTo({ top: n * s.clientHeight, behavior: scrollGedrag() });
  }, [items.length, startDirect]);

  const ytFout = useCallback((i: number, code: unknown) => {
    const besluit = ytVerwijderBesluit(code, i, activeRef.current, items.length, richting.current);
    if (!besluit.verwijder) return;
    const s = scroller.current;
    const oudActief = activeRef.current;
    const top = s?.scrollTop ?? 0;
    const hoogte = s?.clientHeight ?? 0;
    // Bewaar ook een gedeeltelijke swipe wanneer een vooraf geladen video verdwijnt.
    const nieuwTop = i === oudActief && !aanraking.current
      ? besluit.actief * hoogte
      : top - (i * hoogte < top ? Math.min(hoogte, top - i * hoogte) : 0);
    swipeStart.current = null;
    activeRef.current = besluit.actief;
    flushSync(() => {
      setItems((oud) => oud.filter((_, index) => index !== i));
      setActive(besluit.actief);
    });
    if (s) s.scrollTop = nieuwTop;
  }, [items.length]);
  const ytSpeelt = useCallback(() => {}, []);

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
          if (e.target.isConnected && e.isIntersecting && e.intersectionRatio >= 0.6) {
            const i = Number((e.target as HTMLElement).dataset.i);
            if (i !== activeRef.current) {
              richting.current = i < activeRef.current ? -1 : 1;
              startDirect(i);
              activeRef.current = i;
              if (lopendeMeting.current?.slide === i) lopendeMeting.current.actief = performance.now();
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
  }, [gi, items, startDirect]);

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

  // Binnen een tik/swipe (gebruikersgebaar): geluid aanzetten op de huidige video en de andere poolelementen
  // één keer "vrijgeven" (play+pause met geluid), zodat iOS die straks ook met geluid laat starten. iOS
  // onthoudt dat per element; niet bij elk gebaar opnieuw, dat geeft alleen play/pause-churn.
  const vrijgegeven = useRef(new WeakSet<HTMLVideoElement>());
  const unmuteNow = useCallback(() => {
    const r = root.current;
    if (!r) return;
    const cur = r.querySelector<HTMLElement>(`.fslide[data-i="${activeRef.current}"]`);
    let huidig: HTMLVideoElement | null = null;
    pool.els.forEach((el) => {
      el.muted = false;
      if (cur?.contains(el)) {
        huidig = el;
      } else if (el.paused && el.dataset.mse !== "1" && !vrijgegeven.current.has(el)) {
        // (niet bij hls.js/MSE: daar is vrijgeven niet nodig en kan play+pause de MediaSource breken)
        vrijgegeven.current.add(el);
        const p = el.play();
        el.pause();
        p?.catch(() => {});
      }
    });
    // De huidige pas na het (gepauzeerde) vrijgeven van de andere starten.
    const h = huidig as HTMLVideoElement | null;
    if (h) {
      vrijgegeven.current.add(h);
      if (h.paused && !pausedRef.current) h.play().catch(() => {});
    }
    r.querySelectorAll<HTMLIFrameElement>('.fslide[aria-current="true"] iframe.f-yt').forEach((f) =>
      f.contentWindow?.postMessage(JSON.stringify({ event: "command", func: "unMute", args: [] }), "https://www.youtube-nocookie.com")
    );
  }, [pool]);
  const knopEersteOp = useRef(0);
  const soundRef = useRef({ want, nativeBlocked, ytBlokAan: ytBlok.size > 0 });
  soundRef.current = { want, nativeBlocked, ytBlokAan: ytBlok.size > 0 };
  // Een YouTube-blokkade hoort bij de slide waarop ze viel; op een andere slide opnieuw proberen.
  useEffect(() => { ytBlokWis(); }, [active, ytBlokWis]);
  useGebaren({ root, scroller, pool, soundRef, knopEersteOp, vrijgegeven, unmutedAt, aanraking, activeRef, richting, swipeStart, lopendeMeting, metingen, setGetikt, setBlocked, unmuteNow, startDirect, herstel, ytBlokWis });
  const toggleMute = useCallback(() => {
    const eerste = !geluidTik() || Date.now() - knopEersteOp.current < 1000;
    knopEersteOp.current = 0;
    onthoudGeluidTik();
    setGetikt(true);
    const { want: w, nativeBlocked: b, ytBlokAan: yb } = soundRef.current;
    // Een tik voor de eerste gebaar-tik of op een geblokkeerde bron zet geluid aan, nooit uit.
    if (!w || b || yb || eerste) {
      saveSound(true);
      setWant(true);
      setBlocked(false);
      ytBlokWis();
      vrijgegeven.current = new WeakSet();
      unmuteNow();
    } else {
      saveSound(false);
      setWant(false);
    }
  }, [unmuteNow, ytBlokWis]);
  // De tik die het geluid aanzette pauzeert het filmpje niet.
  const onTap = useCallback(() => {
    if (Date.now() - unmutedAt.current < 700) return;
    setPaused((p) => !p);
  }, []);
  const onBlocked = useCallback(() => setBlocked(true), []);

  const geluidHint = activeKind === "youtube" && ytBlok.has(active) ? "Tik in de video voor geluid" : "Tik voor geluid";
  const label = cat === "dumpert" ? "Dumpert" : gs ? gs[gi].label : "Filmpjes";
  return createPortal(
    <div className="app modal-root">
      {DEBUG && <DebugOverlay />}
      <div
        ref={root}
        className={`feed ${closing ? "out" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={`${label}: video ${active + 1} van ${items.length}`}
        onAnimationEnd={(e) => {
          if (e.target === root.current && closing) rondAf();
        }}
      >
        <div className={`feed-scroll ${gi ? "g1" : "g0"}`} id="feed-paneel" role={gs ? "tabpanel" : undefined} key={gi} ref={scroller} tabIndex={-1}>
          {items.map((v, i) => (
            <Slide
              pool={pool}
              key={videoSlug(v) + i}
              v={v}
              i={i}
              total={items.length}
              cat={cat}
              active={i === active}
              mount={mounted.has(i)}
              preload={i === active + 1 ? 1 : 0}
              paused={i === active && paused}
              want={want}
              getikt={getikt}
              nativeBlocked={nativeBlocked}
              ytBlocked={ytBlok.has(i)}
              onTap={onTap}
              onClose={close}
              onAutoplayBlocked={onBlocked}
              onYtBlok={ytBlokAan}
              onYtFout={ytFout}
              onYtSpeelt={ytSpeelt}
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
            <button type="button" className={`f-icon f-sound ${muted ? "" : "on"}`} aria-pressed={!muted} aria-label={muted ? geluidHint : "Geluid uit"} onClick={toggleMute}>
              <Icon name={muted ? "mute" : "volume"} />
              {muted ? <span>{geluidHint}</span> : null}
            </button>
            {/* gs ligt vast zolang de feed open is, dus gi blijft geldig: tabstop en aria-selected volgen dezelfde waarde. */}
            {gs ? (
              <div className="f-tabs" role="tablist" aria-label="Soort filmpjes">
                {gs.map((g, k) => (
                  <button key={g.id} type="button" role="tab" className="f-tab" aria-controls="feed-paneel" aria-selected={k === gi} tabIndex={k === gi ? 0 : -1} onKeyDown={tabToets} onClick={() => pickGroup(k)}>
                    {g.label}
                    <span className="tnum">{g.list.length}</span>
                  </button>
                ))}
              </div>
            ) : null}
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
