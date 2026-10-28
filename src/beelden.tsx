// Foto('s) bij een bericht. Eén foto: gewoon tonen. Meer: horizontaal swipen/tikken met puntjes.
// Native scroll-snap (soepel op 120 Hz, Safari kiest zelf horizontaal óf verticaal, dus geen ruzie met
// het verticale swipen door berichten). Alleen de huidige en de volgende foto worden geladen.
// Kapotte, piepkleine of banner-achtige plaatjes vallen stil weg; blijft er niets over, dan geen fotoblok.
import { memo, useCallback, useEffect, useRef, useState } from "react";

export const Beelden = memo(function Beelden({ urls, eager = false, className = "", onChange }: { urls: string[]; eager?: boolean; className?: string; onChange?: () => void }) {
  const [list, setList] = useState(urls);
  const [i, setI] = useState(0);
  const track = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  // Pas foto's laden als het bericht (bijna) in beeld is: de huidige en de volgende kaart, niet alle 150.
  const [near, setNear] = useState(eager);
  useEffect(() => {
    const el = box.current;
    if (near || !el || !window.IntersectionObserver) { if (!window.IntersectionObserver) setNear(true); return; }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setNear(true); io.disconnect(); } }, { rootMargin: "120% 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [near]);
  const raf = useRef(0);
  useEffect(() => { setList(urls); setI(0); }, [urls]);
  useEffect(() => { onChange?.(); }, [list.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const drop = useCallback((u: string) => setList((l) => l.filter((x) => x !== u)), []);
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
    el.scrollTo({ left: n * el.clientWidth, behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };
  if (!list.length) return null;
  const multi = list.length > 1;
  return (
    <div ref={box} className={`bl ${multi ? "multi" : ""} ${className}`} aria-roledescription={multi ? "fotocarrousel" : undefined}>
      <div
        className="bl-track"
        ref={track}
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
                src={u}
                alt=""
                draggable={false}
                loading={eager && k === 0 ? "eager" : "lazy"}
                decoding="async"
                referrerPolicy="no-referrer"
                onError={() => drop(u)}
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
export const Thumb = memo(function Thumb({ urls }: { urls: string[] }) {
  const [k, setK] = useState(0);
  const u = urls[k];
  if (!u) return null;
  return (
    <span className={`row-img ${urls.length - k > 1 ? "multi" : ""}`} aria-hidden="true">
      <img src={u} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer"
        onError={() => setK(k + 1)}
        onLoad={(e) => { const im = e.currentTarget; if (im.naturalWidth < 160 || im.naturalHeight < 100 || im.naturalWidth / im.naturalHeight > 4) setK(k + 1); else im.classList.add("in"); }} />
    </span>
  );
});
