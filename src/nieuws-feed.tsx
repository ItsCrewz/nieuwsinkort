import { useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState,type ReactNode } from "react";
import { Footer } from "./app-frame";
import { rustig,scrollGedrag } from "./beweging";
import { FeedNavigatie } from "./feednavigatie";
import { Icon } from "./icons";
import { itemKey,pickLead,sortItems } from "./nieuws-hulp";
import { KAARTEN_VOORAF,KAARTEN_VOORUIT,NewsCard } from "./nieuws-kaart";
import { OpenFn } from "./nieuws-lijst";
import type { Item } from "./types";



export function NewsFeed({ items, head, bionic, focusKey, onOpen, keepOrder, empty, kompakt, samenvatting }: { items: Item[]; head: ReactNode; kompakt?: boolean; samenvatting?: boolean; bionic: boolean; focusKey: string | null; onOpen: OpenFn; keepOrder?: boolean; empty?: ReactNode }) {
  const sorted = useMemo(() => {
    if (keepOrder) return items;
    const s = sortItems(items);
    const li = pickLead(s);
    return li > 0 ? [s[li], ...s.filter((_, k) => k !== li)] : s;
  }, [items, keepOrder]);
  const ref = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLSpanElement>(null);
  const startRef = useRef<HTMLButtonElement>(null);
  const [idx, setIdx] = useState(-1); // -1 = de "vandaag"-kaart met samenvatting en weer
  const idxRef = useRef(idx);
  idxRef.current = idx;
  const total = sorted.length;
  // Alleen de eerste kaarten + een venster rond de huidige positie krijgen inhoud (DOM 7600 -> ~1500 elementen); lege kaarten houden dezelfde hoogte.
  const focusIdx = focusKey ? sorted.findIndex((x) => itemKey(x) === focusKey) : -1;
  const mountRef = useRef(0);
  mountRef.current = Math.max(mountRef.current, Math.min(total, Math.max(KAARTEN_VOORAF, idx + 1 + KAARTEN_VOORUIT, focusIdx + 1 + KAARTEN_VOORUIT)));
  const mount = mountRef.current;

  // Positie bijhouden: één rAF per scrollframe, state alleen bij een nieuwe kaart; de balk via transform.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const read = () => {
      raf = 0;
      const cards = el.querySelectorAll<HTMLElement>(".nc");
      const y = el.scrollTop + el.clientHeight * 0.4;
      let cur = -1;
      for (let k = 0; k < cards.length; k++) if (cards[k].offsetTop <= y) cur = k;
      if (cur !== idxRef.current) setIdx(cur);
      const max = el.scrollHeight - el.clientHeight;
      startRef.current?.classList.toggle("off", el.scrollTop > 60);
      if (railRef.current) railRef.current.style.transform = `scaleY(${max > 0 ? Math.min(1, el.scrollTop / max) : 0})`;
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(read);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    read();
    // Kaart-entree (DOM-klassen, geen React-render): kaarten die bij het mounten buiten beeld liggen krijgen 'wacht' en spelen eenmalig 'in' af als ze in beeld komen.
    // Kaarten die al in beeld staan (eerste kaart, LCP) of die bij terug-uit-artikel horen, en alles bij reduced motion, krijgen niets.
    const io = new IntersectionObserver(
      (es) => es.forEach((e) => {
        if (!e.isIntersecting) return;
        const c = e.target as HTMLElement;
        if (c.classList.contains("wacht")) { c.classList.remove("wacht"); c.classList.add("in"); }
        io.unobserve(c);
      }),
      { root: el, threshold: 0.35 }
    );
    const cards = Array.from(el.querySelectorAll<HTMLElement>(".nc"));
    const nieuw = cards.filter((c) => !c.dataset.b); // bij een herrun (nieuwe data) alleen nieuwe kaarten beoordelen
    const vr = el.getBoundingClientRect();
    const rects = nieuw.map((c) => c.getBoundingClientRect()); // eerst alles meten, dan schrijven
    nieuw.forEach((c, k) => {
      c.dataset.b = "1";
      if (!rustig() && !(rects[k].bottom > vr.top && rects[k].top < vr.bottom)) c.classList.add("wacht");
    });
    cards.forEach((c) => c.classList.contains("wacht") && io.observe(c));
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, [sorted]);

  // Terug uit een bericht: meteen weer op die kaart.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !focusKey) return;
    const n = el.querySelector<HTMLElement>(`[data-id="${CSS.escape(focusKey)}"]`);
    if (!n) return;
    el.scrollTop = n.offsetTop;
    // doelkaart en buren: geen entree (dataset.b voorkomt 'wacht' in het IO-effect)
    const c = n.closest<HTMLElement>(".nc");
    [c?.previousElementSibling, c, c?.nextElementSibling].forEach((x) => { if (x instanceof HTMLElement && x.classList.contains("nc")) x.dataset.b = "1"; });
  }, [focusKey]);

  const go = useCallback((to: number) => {
    const el = ref.current;
    if (!el) return;
    const cards = el.querySelectorAll<HTMLElement>(".nc");
    const k = Math.max(-1, Math.min(cards.length - 1, to));
    el.scrollTo({ top: k < 0 ? 0 : cards[k].offsetTop, behavior: scrollGedrag() });
  }, []);

  // Pijltjes, PageUp/Down, spatie, j/k, Home/End
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.closest("input,textarea,select,[contenteditable],.sheet,.menu,[role=dialog]") || document.querySelector(".sheet,.feed"))) return;
      const k = e.key;
      // spatie/Enter op een knop, link of ander bedienbaar element: native activatie laten werken
      if ((k === " " || k === "Enter") && t && t.closest("button,a,input,textarea,select,summary,[role=button],[contenteditable]")) return;
      let to: number | null = null;
      if (k === "ArrowDown" || k === "PageDown" || k === "j" || (k === " " && !e.shiftKey)) to = idxRef.current + 1;
      else if (k === "ArrowUp" || k === "PageUp" || k === "k" || (k === " " && e.shiftKey)) to = idxRef.current - 1;
      else if (k === "Home") to = -1;
      else if (k === "End") to = 1e6;
      if (to === null) return;
      if (t && t.closest(".tabs") && (k === "ArrowUp" || k === "ArrowDown")) return;
      e.preventDefault();
      go(to);
    };
    const onTop = () => go(-1);
    window.addEventListener("keydown", onKey);
    window.addEventListener("nf-top", onTop);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("nf-top", onTop);
    };
  }, [go]);

  return (
    <div className="nf-box">
      <div className="nf" ref={ref} tabIndex={-1} role="region" aria-label="Berichten, één per scherm">
        <div className={kompakt ? `nc-head kompakt${samenvatting ? " samenvatting" : ""}` : "nc-head"}>{head}</div>
        {total === 0 ? (
          empty ?? <div className="empty">
            <Icon name="clock" />
            Nog geen berichten van vandaag in deze rubriek. Het eerste nieuws van vandaag komt rond 05:00–06:00.
          </div>
        ) : (
          sorted.map((it, i) => <NewsCard key={itemKey(it)} item={it} i={i} total={total} bionic={bionic} onOpen={onOpen} leeg={i >= mount} />)
        )}
        <div className="nc-end">
          <Footer />
        </div>
      </div>
      {total > 0 ? (
        <>
        <FeedNavigatie verborgen={idx < 0}>
          <span className="nf-rail">
            <span ref={railRef} />
          </span>
          <div className={`nf-pos ${idx >= 0 ? "on" : ""}`}>
            <button type="button" className="nf-btn" aria-label="Vorig bericht" onClick={() => go(idx - 1)}>
              <Icon name="chevup" />
            </button>
            <span className="tnum" aria-live="polite">
              {Math.max(1, idx + 1)}/{total}
            </span>
            <button type="button" className="nf-btn" aria-label="Volgend bericht" onClick={() => go(idx + 1)}>
              <Icon name="chevdown" />
            </button>
          </div>
        </FeedNavigatie>
          {idx < 0 ? (
            <button type="button" ref={startRef} className="nf-start" onClick={() => go(0)}>
              {total} berichten
              <Icon name="chevdown" />
            </button>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
