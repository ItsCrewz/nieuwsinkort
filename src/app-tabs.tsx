import { useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState } from "react";
import { rustig } from "./beweging";
import { Icon } from "./icons";
import { bronnenTekst } from "./leesverder";
import { tabOpties,volgendeTab,type TabOpt } from "./tabs";
import type { Data,View } from "./types";
import { BionicText } from "./ui";



export function Briefing({ text, bionic, sources, time, note }: { text: string; bionic: boolean; sources: number; time: string; note?: string }) {
  return (
    <section className="brief" aria-label="In het kort">
      <h2 className="kicker">In het kort</h2>
      {text ? (
        <p className="brief-text bn">
          <BionicText text={text} on={bionic} />
        </p>
      ) : (
        <p className="brief-text muted">De samenvatting van vandaag komt er zo aan.</p>
      )}
      {sources > 0 ? (
        <p className="brief-meta">
          Samengevat uit {bronnenTekst(sources)}
          {time ? <> · <span className="tnum">{time}</span></> : null}
        </p>
      ) : null}
      {note ? <p className="brief-note">{note}</p> : null}
    </section>
  );
}


export // ---------------------------------------------------------------- tabs
// Gesegmenteerde rubriekkeuze. Past alles niet op één regel, dan gaan de laatste rubrieken in "Meer"
// (er scrollt dus niets zijwaarts in de header). De actieve rubriek staat altijd zichtbaar.
function Tabs({ data, view, onChange }: { data: Data; view: View; onChange: (v: View) => void }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const indRef = useRef<HTMLSpanElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);
  const prev = useRef<{ x: number; w: number } | null>(null);
  const [fit, setFit] = useState<{ short: boolean; count: number }>({ short: false, count: 99 });
  const [open, setOpen] = useState(false);
  const options: TabOpt[] = useMemo(() => tabOpties(data.items, view), [data.items, view]);
  const activeIdx = Math.max(0, options.findIndex((o) => o.value === view));

  // Welke tabs passen? Meten in een onzichtbare kopie (vaste breedtes, geen layout-sprongen in beeld).
  const compute = useCallback(() => {
    const wrap = wrapRef.current;
    const m = measureRef.current;
    if (!wrap || !m) return;
    const avail = wrap.clientWidth;
    const pick = (short: boolean) => {
      const row = m.querySelector<HTMLElement>(short ? ".m-short" : ".m-long");
      if (!row) return null;
      const kids = [...row.children] as HTMLElement[];
      const pad = 6; // binnenrand van de track
      const ws = kids.slice(0, options.length).map((k) => k.offsetWidth);
      const meer = kids[options.length]?.offsetWidth ?? 70;
      const total = ws.reduce((a, b) => a + b, 0) + pad;
      if (total <= avail) return options.length;
      let k = options.length - 1;
      const need = (n: number) => {
        let sum = ws.slice(0, n).reduce((a, b) => a + b, 0);
        if (activeIdx >= n) sum += ws[activeIdx];
        return sum + meer + pad;
      };
      while (k > 1 && need(k) > avail) k--;
      return k;
    };
    const long = avail >= 560 ? pick(false) : null;
    if (long !== null && long === options.length) setFit((f) => (f.short || f.count !== long ? { short: false, count: long } : f));
    else {
      const k = pick(true) ?? options.length;
      setFit((f) => (!f.short || f.count !== k ? { short: true, count: k } : f));
    }
  }, [options, activeIdx]);
  useLayoutEffect(() => compute(), [compute]);
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || !window.ResizeObserver) return;
    const ro = new ResizeObserver(() => compute());
    ro.observe(wrap);
    document.fonts?.ready.then(() => compute()).catch(() => {});
    return () => ro.disconnect();
  }, [compute]);

  const shown = options.filter((_, i) => i < fit.count || i === activeIdx);
  const rest = options.filter((o) => !shown.includes(o));

  // Pil-indicator: breedte staat stil op de eindmaat; de beweging is een FLIP met alleen transform.
  const place = useCallback((sel: HTMLElement | null, animate: boolean) => {
    const ind = indRef.current;
    if (!ind || !sel) return;
    const x = sel.offsetLeft;
    const w = sel.offsetWidth;
    const from = prev.current;
    prev.current = { x, w };
    if (from && from.x === x && from.w === w && ind.classList.contains("ready")) return;
    ind.style.width = `${w}px`;
    if (animate && from && !rustig()) {
      ind.style.transition = "none";
      ind.style.transform = `translate3d(${from.x}px,0,0) scaleX(${from.w / w})`;
      void ind.offsetWidth;
      ind.style.transition = "";
    }
    ind.style.transform = `translate3d(${x}px,0,0)`;
    ind.classList.add("ready");
  }, []);
  const firstPlace = useRef(true);
  useLayoutEffect(() => {
    place(listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]') ?? null, !firstPlace.current);
    firstPlace.current = false;
  }, [view, fit, place]);
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      if (!moreRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  const label = (o: TabOpt) => (fit.short ? o.short : o.label);
  return (
    <nav className="tabs" aria-label="Rubrieken">
      <div className="tabs-in" ref={wrapRef}>
        <div className="seg" ref={listRef}>
          <span className="seg-ind" ref={indRef} aria-hidden="true" />
          <div className="seg-tabs" role="tablist" aria-label="Rubrieken">
          {shown.map((o) => (
            <button
              key={o.value}
              type="button"
              className={`tab cat-${o.id}`}
              role="tab"
              data-video-tab={o.value === "filmpjes" || o.value === "dumpert" ? "" : undefined}
              aria-controls="rubriek-paneel"
              aria-selected={view === o.value}
              tabIndex={view === o.value ? 0 : -1}
              onKeyDown={(e) => {
                const tabs = [...e.currentTarget.parentElement!.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
                const i = tabs.indexOf(e.currentTarget);
                const volgende = volgendeTab(i, tabs.length, e.key);
                if (volgende === null) return;
                e.preventDefault();
                const next = tabs[volgende];
                next.focus();
                next.click();
              }}
              onClick={(e) => {
                place(e.currentTarget, true); // meteen bewegen, de inhoud volgt
                onChange(o.value);
              }}
            >
              {label(o)}
            </button>
          ))}
          </div>
          {rest.length ? (
            <div className="more-wrap" ref={moreRef}>
              <button type="button" className={`tab more-btn ${open ? "open" : ""}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
                Meer <Icon name="chevdown" className="sm" />
              </button>
              {open ? (
                <div className="menu" role="menu">
                  {rest.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      role="menuitem"
                      className="menu-item"
                      data-video-tab={o.value === "filmpjes" || o.value === "dumpert" ? "" : undefined}
                      onClick={() => {
                        setOpen(false);
                        onChange(o.value);
                      }}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="seg-measure" ref={measureRef} aria-hidden="true">
          {[false, true].map((short) => (
            <div key={String(short)} className={`seg ${short ? "m-short" : "m-long"}`}>
              {options.map((o) => (
                <span key={o.value} className="tab-m">
                  {short ? o.short : o.label}
                </span>
              ))}
              <span className="tab-m">
                Meer <Icon name="chevdown" className="sm" />
              </span>
            </div>
          ))}
        </div>
      </div>
    </nav>
  );
}
