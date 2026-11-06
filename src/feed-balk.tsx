// Voortgangsbalk (Web Animations API) en het aanraakbare doorspoelvlak van de videofeed.
import { useCallback, useRef, useState } from "react";

export type Bar = { set: (cur: number, dur: number, playing: boolean) => void; stop: () => void };
export function useBar(ref: React.RefObject<HTMLElement>): Bar {
  const anim = useRef<Animation | null>(null);
  const set = useCallback(
    (cur: number, dur: number, playing: boolean) => {
      const el = ref.current;
      if (!el || !(dur > 0) || !isFinite(dur)) return;
      const p = Math.min(1, Math.max(0, cur / dur));
      anim.current?.cancel();
      if (!playing || !el.animate) {
        el.style.transform = `scaleX(${p})`;
        anim.current = null;
        return;
      }
      el.style.transform = "";
      anim.current = el.animate([{ transform: `scaleX(${p})` }, { transform: "scaleX(1)" }], {
        duration: Math.max(0, (dur - cur) * 1000),
        easing: "linear",
        fill: "forwards",
      });
    },
    [ref]
  );
  const stop = useCallback(() => {
    anim.current?.pause();
  }, []);
  return { set, stop };
}

// Doorspoelen: de speler meldt zich hier aan, de balk onderaan stuurt hem aan.
export type SeekApi = { dur: () => number; cur: () => number; seek: (t: number) => void };
export type SeekRef = React.MutableRefObject<SeekApi | null>;

// ------------------------------------------------------------- doorspoelen op de voortgangsbalk
const fmt = (t: number) => {
  if (!isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
};
// De bestaande dunne balk onderaan, maar dan aanraakbaar: tikken of slepen = doorspoelen. Een ruim (onzichtbaar)
// raakvlak met touch-action:none, zodat slepen op de balk de feed niet verticaal laat swipen.
export function Scrub({ bar, barEl, seek, enabled, title }: { bar: Bar; barEl: React.RefObject<HTMLSpanElement>; seek: SeekRef; enabled: boolean; title: string }) {
  const hit = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ p: number; d: number } | null>(null);
  const st = useRef<{ id: number; p: number } | null>(null);
  // aria-valuenow/-text: de balk zelf beweegt buiten React om, dus lees de stand bij focus en na toetsen/slepen
  const [pos, setPos] = useState({ t: 0, d: 0 });
  const lees = (t?: number) => {
    const api = seek.current;
    const d = api?.dur() ?? 0;
    setPos(d > 0 && isFinite(d) ? { t: Math.min(d, Math.max(0, t ?? api!.cur())), d } : { t: 0, d: 0 });
  };
  const ratio = (x: number) => {
    const r = hit.current!.getBoundingClientRect();
    return Math.min(1, Math.max(0, (x - r.left) / (r.width || 1)));
  };
  const preview = (p: number, d: number) => {
    bar.set(p * d, d, false);
    setDrag({ p, d });
  };
  const down = (e: React.PointerEvent<HTMLDivElement>) => {
    const api = seek.current;
    const d = api?.dur() ?? 0;
    e.stopPropagation();
    if (!api || !(d > 0) || !isFinite(d)) return;
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* oude browsers */
    }
    const p = ratio(e.clientX);
    st.current = { id: e.pointerId, p };
    preview(p, d);
  };
  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = st.current;
    if (!s || s.id !== e.pointerId) return;
    e.stopPropagation();
    e.preventDefault();
    s.p = ratio(e.clientX);
    preview(s.p, drag?.d ?? seek.current?.dur() ?? 0);
  };
  const up = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = st.current;
    if (!s || s.id !== e.pointerId) return;
    e.stopPropagation();
    st.current = null;
    const api = seek.current;
    const d = api?.dur() ?? 0;
    if (e.type !== "pointercancel" && api && d > 0) api.seek(s.p * d);
    setDrag(null);
    lees(e.type !== "pointercancel" ? s.p * d : undefined);
  };
  const key = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const api = seek.current;
    if (!api) return;
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      e.stopPropagation();
      const t = api.cur() + (e.key === "ArrowRight" ? 5 : -5);
      api.seek(t);
      lees(t);
    }
  };
  return (
    <div
      ref={hit}
      className={`f-scrub ${drag ? "drag" : ""} ${enabled ? "" : "off"}`}
      role="slider"
      aria-label={`Doorspoelen: ${title}`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={drag ? Math.round(drag.p * 100) : pos.d > 0 ? Math.round((pos.t / pos.d) * 100) : 0}
      aria-valuetext={drag ? `${fmt(drag.p * drag.d)} van ${fmt(drag.d)}` : `${fmt(pos.t)} van ${fmt(pos.d)}`}
      onFocus={() => lees()}
      tabIndex={enabled ? 0 : -1}
      onPointerDown={enabled ? down : undefined}
      onPointerMove={enabled ? move : undefined}
      onPointerUp={enabled ? up : undefined}
      onPointerCancel={enabled ? up : undefined}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={enabled ? key : undefined}
    >
      {drag ? (
        <span className="f-time tnum" aria-hidden="true">
          <b>{fmt(drag.p * drag.d)}</b> / {fmt(drag.d)}
        </span>
      ) : null}
      <span className="f-bar" aria-hidden="true">
        <span ref={barEl} />
      </span>
    </div>
  );
}
