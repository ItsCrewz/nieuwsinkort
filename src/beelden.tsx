// Foto('s) bij een bericht. Eén foto: gewoon tonen. Meer: horizontaal swipen/tikken met puntjes.
// Native scroll-snap (soepel op 120 Hz, Safari kiest zelf horizontaal óf verticaal, dus geen ruzie met
// het verticale swipen door berichten). Alleen de huidige en de volgende foto worden geladen.
// Kapotte, piepkleine of banner-achtige plaatjes vallen stil weg; blijft er niets over, dan geen fotoblok.
import { memo, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { beeldViaProxy } from "./beeldhost";
import { scrollGedrag } from "./beweging";

// ---------------------------------------------------------------- vooruit laden
// Tijdens scrollen laden we de eerste foto van de volgende 3 berichten (in de scrollrichting) al helemaal in,
// inclusief decoderen, zodat hij er meteen staat. Van het bericht in beeld ook al de 2e carrouselfoto.
// Begrensd: nooit meer dan een handvol tegelijk, dus niet alle 200 foto's in één keer (die bevriezing blijft weg).
const AHEAD = 3;
const klaar = new Map<string, string>(); // originele URL naar de gedecodeerde bron
// Na een tijdelijke fout krijgt de proxy bij een volgende aanvraag opnieuw een kans.
const TERUGVAL_MS = 60_000;
const rechtstreeks = new Map<string, number>();
export const bronUrl = (u: string): string => {
  const tot = rechtstreeks.get(u);
  if (tot !== undefined && Date.now() < tot) return u;
  if (tot !== undefined) rechtstreeks.delete(u);
  return beeldViaProxy(u);
};
/** Een falende proxy krijgt één rechtstreekse poging, ook bij gelijktijdige preload en weergave. */
export function naarRechtstreeks(u: string, huidig?: string | null): boolean {
  if (beeldViaProxy(u) === u || huidig === u) return false;
  if (huidig == null && bronUrl(u) === u) return false;
  rechtstreeks.set(u, Date.now() + TERUGVAL_MS);
  return true;
}
const bezig = new Map<string, Promise<void>>();
export function preloadBeeld(u: string | undefined): Promise<void> {
  if (!u || klaar.get(u) === bronUrl(u)) return Promise.resolve();
  const p0 = bezig.get(u);
  if (p0) return p0;
  let afgerond = false;
  let im: HTMLImageElement | undefined;
  let timer: ReturnType<typeof setTimeout>;
  const p = new Promise<void>((resolve) => {
    const stop = (geladen?: string) => {
      if (afgerond) return;
      afgerond = true;
      clearTimeout(timer);
      if (im) { im.onload = null; im.onerror = null; }
      if (geladen) klaar.set(u, geladen);
      resolve();
    };
    const laad = (src: string) => {
      im = new Image();
      im.referrerPolicy = "no-referrer";
      im.decoding = "async";
      const fout = () => {
        if (afgerond) return;
        if (im) { im.onload = null; im.onerror = null; }
        if (naarRechtstreeks(u, src)) laad(u);
        else stop();
      };
      if (im.decode) { im.src = src; im.decode().then(() => stop(src), fout); return; }
      // Zonder decode(): handlers vóór src (een snelle cachehit mag de gebeurtenis niet missen), en een al
      // voltooide afbeelding direct afhandelen.
      im.onload = () => stop(src);
      im.onerror = fout;
      im.src = src;
      if (im.complete) { if (im.naturalWidth > 0) stop(src); else fout(); }
    };
    timer = setTimeout(() => stop(), 10000);
    laad(bronUrl(u)); // zelfde URL als de <img src>, anders dubbele downloads
  }).finally(() => { if (bezig.get(u) === p) bezig.delete(u); });
  bezig.set(u, p);
  return p;
}
type Reg = { el: HTMLElement; wake: () => void; first: () => string | undefined; second: () => string | undefined };
const regs = new Set<Reg>();
const zichtbaar = new Set<Reg>();
let richting = 1; // 1 = omlaag/verder, -1 = terug
let ordered: Reg[] | null = null;
let visIO: IntersectionObserver | null = null;
let plan = 0;
function vooruit() {
  cancelAnimationFrame(plan);
  plan = requestAnimationFrame(() => {
    if (!zichtbaar.size) return;
    if (!ordered) ordered = [...regs].filter((r) => r.el.isConnected).sort((a, b) => (a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    const idx = ordered.map((r, k) => (zichtbaar.has(r) ? k : -1)).filter((k) => k >= 0);
    if (!idx.length) return;
    for (const k of idx) preloadBeeld(ordered[k].second()); // 2e foto van wat nu in beeld is
    const from = richting > 0 ? Math.max(...idx) : Math.min(...idx);
    for (let n = 1; n <= AHEAD; n++) {
      const r = ordered[from + n * richting];
      if (!r) break;
      preloadBeeld(r.first()).then(() => r.wake()); // decoderen, daarna de <img> al plaatsen (buiten beeld)
    }
  });
}
const lastTop = new WeakMap<EventTarget, number>();
function onAnyScroll(e: Event) {
  const t = e.target === document ? document.scrollingElement || document.documentElement : (e.target as HTMLElement);
  if (!t || !(t as HTMLElement).scrollHeight) return;
  const top = (t as HTMLElement).scrollTop;
  const prev = lastTop.get(t);
  lastTop.set(t, top);
  if (prev === undefined || Math.abs(top - prev) < 2) return;
  const d = top > prev ? 1 : -1;
  if (d !== richting) { richting = d; vooruit(); }
}
function register(r: Reg) {
  if (!visIO && typeof window !== "undefined" && window.IntersectionObserver) {
    visIO = new IntersectionObserver((es) => {
      for (const e of es) {
        const r = [...regs].find((x) => x.el === e.target);
        if (!r) continue;
        if (e.isIntersecting) zichtbaar.add(r); else zichtbaar.delete(r);
      }
      vooruit();
    }, { threshold: 0.01 });
    window.addEventListener("scroll", onAnyScroll, { capture: true, passive: true });
  }
  regs.add(r);
  ordered = null;
  visIO?.observe(r.el);
  return () => { regs.delete(r); zichtbaar.delete(r); ordered = null; visIO?.unobserve(r.el); };
}

export const Beelden = memo(function Beelden({ urls, eager = false, voorrang = eager, className = "", onChange }: { urls: string[]; eager?: boolean; voorrang?: boolean; className?: string; onChange?: () => void }) {
  const [list, setList] = useState(urls);
  const [i, setI] = useState(0);
  const instructieId = useId();
  const track = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  // Pas foto's plaatsen als het bericht (bijna) in beeld is, of als de vooruitlader hem al heeft binnengehaald
  // (volgende 3 berichten in de scrollrichting). Niet alle 200 tegelijk.
  const [near, setNear] = useState(eager);
  useEffect(() => {
    const el = box.current;
    if (near || !el || !window.IntersectionObserver) { if (!window.IntersectionObserver) setNear(true); return; }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setNear(true); io.disconnect(); } }, { rootMargin: "200% 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [near]);
  const listRef = useRef(urls);
  const iRef = useRef(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    return register({ el, wake: () => setNear(true), first: () => listRef.current[0], second: () => listRef.current[iRef.current + 1] });
  }, []);
  const [, herlaad] = useState(0);
  const raf = useRef(0);
  useLayoutEffect(() => {
    const huidig = listRef.current[iRef.current];
    const nieuw = Math.max(0, urls.indexOf(huidig));
    cancelAnimationFrame(raf.current);
    setList(urls);
    setI(nieuw);
  }, [urls]);
  useLayoutEffect(() => {
    const el = track.current;
    if (el) el.scrollLeft = i * el.clientWidth;
  }, [list]); // eslint-disable-line react-hooks/exhaustive-deps
  listRef.current = list;
  iRef.current = i;
  useEffect(() => { if (i > 0) preloadBeeld(list[i + 1]); }, [i, list]); // door de carrousel bladeren: volgende foto alvast
  useEffect(() => { onChange?.(); }, [list.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const drop = useCallback((u: string) => {
    if (listRef.current.length === 2 && box.current?.contains(document.activeElement)) track.current?.focus();
    setList((l) => l.filter((x) => x !== u));
    setI((n) => Math.max(0, Math.min(n, listRef.current.length - 2))); // alleen terug als de huidige foto buiten de lijst valt
  }, []);
  const onScroll = useCallback(() => {
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      const el = track.current;
      if (el && el.clientWidth) setI(Math.max(0, Math.min(list.length - 1, Math.round(el.scrollLeft / el.clientWidth))));
    });
  }, [list.length]);
  const go = (k: number) => {
    const el = track.current;
    if (!el) return;
    const n = (k + list.length) % list.length;
    el.scrollTo({ left: n * el.clientWidth, behavior: scrollGedrag() });
  };
  if (!list.length) return null;
  const multi = list.length > 1;
  return (
    <div ref={box} className={`bl ${multi ? "multi" : ""} ${className}`} aria-roledescription={multi ? "fotocarrousel" : undefined}>
      <div
        className="bl-track"
        ref={track}
        tabIndex={multi ? 0 : -1}
        role={multi ? "group" : undefined}
        aria-label={multi ? "Foto's" : undefined}
        aria-describedby={multi ? instructieId : undefined}
        onKeyDown={multi ? (e) => {
          if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
            e.preventDefault();
            go(e.key === "ArrowRight" ? i + 1 : i - 1);
          }
        } : undefined}
        onScroll={multi ? onScroll : undefined}
        onClick={multi ? (e) => {
          const r = e.currentTarget.getBoundingClientRect();
          e.preventDefault();
          e.stopPropagation();
          go(e.clientX - r.left > r.width * 0.35 ? i + 1 : i - 1);
        } : undefined}
      >
        {list.map((u, k) => (
          <div className="bl-slide" key={u} aria-hidden={k !== i || undefined}>
            {near && (k <= i + 1 || k === list.length - 1 && i === 0) ? (
              <img
                src={bronUrl(u)}
                alt=""
                aria-hidden="true"
                draggable={false}
                loading={k === 0 ? "eager" : "lazy"}
                fetchPriority={voorrang && k === 0 ? "high" : undefined}
                className={klaar.get(u) === bronUrl(u) ? "in" : undefined}
                decoding="async"
                referrerPolicy="no-referrer"
                onError={(e) => (naarRechtstreeks(u, e.currentTarget.getAttribute("src")) ? herlaad((n) => n + 1) : drop(u))}
                onLoad={(e) => {
                  const im = e.currentTarget;
                  const w = im.naturalWidth, h = im.naturalHeight;
                  if (w < 200 || h < 120 || w / h > 4 || h / w > 2.2) drop(u); // logo/icoon/banner
                  else im.classList.add("in");
                }}
              />
            ) : null}
          </div>
        ))}
      </div>
      {multi ? (
        <>
          <span id={instructieId} className="sr-only">Gebruik de pijltjestoetsen links en rechts om van foto te wisselen.</span>
          <div className="bl-dots" aria-hidden="true">
            {list.map((u, k) => <span key={u} className={k === i ? "on" : ""} />)}
          </div>
          <button type="button" className="bl-nav prev" aria-label="Vorige foto" onClick={(e) => { e.stopPropagation(); e.preventDefault(); go(i - 1); }}>‹</button>
          <button type="button" className="bl-nav next" aria-label="Volgende foto" onClick={(e) => { e.stopPropagation(); e.preventDefault(); go(i + 1); }}>›</button>
          <span className="sr-only" aria-live="polite">Foto {i + 1} van {list.length}</span>
        </>
      ) : null}
    </div>
  );
});

/** Kleine vierkante foto voor de lijst (alleen de eerste); valt weg als hij niet laadt. */
/** Index van de foto die Thumb probeert. Verandert de inhoud van de lijst (ververst bericht), dan terug naar de eerste;
 *  een rerender met dezelfde lijst (nieuwe array, zelfde urls) laat de index staan. */
export function useThumbIndex(urls: string[]): [number, (k: number) => void] {
  const sleutel = urls.join("\n");
  const [st, setSt] = useState({ sleutel, k: 0 });
  if (st.sleutel !== sleutel) { setSt({ sleutel, k: 0 }); return [0, (k) => setSt({ sleutel, k })]; }
  return [st.k, (k) => setSt({ sleutel, k })];
}

export const Thumb = memo(function Thumb({ urls }: { urls: string[] }) {
  const [k, setK] = useThumbIndex(urls);
  const [, herlaad] = useState(0);
  const u = urls[k];
  if (!u) return null;
  return (
    <span className={`row-img ${urls.length - k > 1 ? "multi" : ""}`} aria-hidden="true">
      <img src={bronUrl(u)} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer"
        onError={(e) => (naarRechtstreeks(u, e.currentTarget.getAttribute("src")) ? herlaad((n) => n + 1) : setK(k + 1))}
        onLoad={(e) => { const im = e.currentTarget; if (im.naturalWidth < 160 || im.naturalHeight < 100 || im.naturalWidth / im.naturalHeight > 4) setK(k + 1); else im.classList.add("in"); }} />
    </span>
  );
});
