// Samenvatting op verzoek: knop + onderblad van de videofeed.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Video } from "./types";
import { Icon } from "./icons";
import { videoSlug } from "./slug";
import { svCache, type Sv } from "./samenvattingcache";

// ------------------------------------------------------------- samenvatting op verzoek
// Knop + onderblad. De server (functions/samenvatting.ts) haalt ondertiteling of luistert de eerste minuten,
// vat samen in simpele punten en bewaart dat per filmpje, dus de tweede keer is het meteen klaar.
async function haalSamenvatting(id: string, signal: AbortSignal): Promise<Sv> {
  const hit = svCache.get(id);
  if (hit) return hit;
  for (let poging = 0; poging < 8; poging++) {
    let r: Response;
    try {
      r = await fetch("/samenvatting", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }), signal });
    } catch (e) {
      if (signal.aborted) throw e;
      return { ok: false, code: "net", fout: "Geen verbinding. Check je internet en probeer het nog eens." };
    }
    const j = (await r.json().catch(() => null)) as Sv | null;
    if (j && !j.ok && j.code === "bezig") { await new Promise((ok) => setTimeout(ok, 4000)); continue; }
    if (!j) return { ok: false, code: "fout", fout: "Samenvatten lukt even niet. Probeer het later nog eens." };
    if (j.ok || ["geen-tekst", "te-lang", "onbekend"].includes(j.code)) svCache.set(id, j);
    return j;
  }
  return { ok: false, code: "fout", fout: "Het duurt te lang. Probeer het zo nog eens." };
}
const stop = (e: React.SyntheticEvent) => e.stopPropagation();
export function SamenvattingKnop({ v }: { v: Video }) {
  const [open, setOpen] = useState(false);
  const klaar = (svCache.get(videoSlug(v)) as any)?.ok === true;
  return (
    <>
      <button type="button" className={`f-btn${klaar ? " sv-klaar" : ""}`} onClick={(e) => { e.stopPropagation(); setOpen(true); }} aria-haspopup="dialog">
        Samenvatting{klaar ? <span className="sv-dot" aria-label="klaar" title="Staat al klaar" /> : null}
      </button>
      {open ? createPortal(<SamenvattingBlad v={v} onClose={() => setOpen(false)} />, document.body) : null}
    </>
  );
}
function SamenvattingBlad({ v, onClose }: { v: Video; onClose: () => void }) {
  const id = videoSlug(v);
  const [res, setRes] = useState<Sv | null>(() => svCache.get(id) || null);
  const [n, setN] = useState(0);
  const closeBtn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (svCache.has(id) && n === 0) return;
    const ac = new AbortController();
    setRes(null);
    haalSamenvatting(id, ac.signal).then(setRes, () => {});
    return () => ac.abort();
  }, [id, n]);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    closeBtn.current?.focus({ preventScroll: true });
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); onClose(); } };
    window.addEventListener("keydown", key, true);
    return () => { window.removeEventListener("keydown", key, true); prev?.focus?.({ preventScroll: true }); };
  }, [onClose]);
  const min = res && res.ok && res.sec ? Math.max(1, Math.round(res.sec / 60)) : 0;
  return (
    <div className="sv-wrap" onClick={(e) => { e.stopPropagation(); onClose(); }} onPointerDown={stop} onTouchStart={stop} onTouchMove={stop} onWheel={stop} onKeyDown={stop}>
      <div className="sv-sheet" role="dialog" aria-modal="true" aria-labelledby="sv-kop" onClick={stop}>
        <div className="sv-head">
          <h2 id="sv-kop" className="sv-kop">Samenvatting</h2>
          <button ref={closeBtn} type="button" className="sv-x" onClick={onClose} aria-label="Sluit samenvatting">
            <Icon name="x" />
          </button>
        </div>
        <p className="sv-titel">{v.titel}</p>
        <div className="sv-body" aria-live="polite" aria-busy={!res}>
          {!res ? (
            <p className="sv-laden"><span className="sv-dot" aria-hidden="true" />Even kijken en luisteren…</p>
          ) : res.ok ? (
            <>
              <ul className="sv-punten">{res.punten.map((p, k) => <li key={k}>{p}</li>)}</ul>
              <p className="sv-bron">
                {res.bron === "spraak" ? `Uit wat er gezegd wordt${min ? ` (eerste ${min} min)` : ""}` : "Uit de ondertiteling"} · samengevat door AI, kan foutjes bevatten
              </p>
            </>
          ) : (
            <>
              <p className="sv-fout">{res.fout}</p>
              {["fout", "net", "bezig", "geblokkeerd"].includes(res.code) ? (
                <button type="button" className="f-btn" onClick={() => { svCache.delete(id); setN((x) => x + 1); }}>Probeer opnieuw</button>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
