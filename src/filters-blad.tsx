// Filterblad (onderblad); lui geladen zodat het hoofdscherm alleen de knop (FilterBalk) en de filterlogica draagt.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Item } from "./types";
import { Icon } from "./icons";
import { CAT_OPT, REGIO_LABEL, STANDAARD, TIJD_LABEL, heeftVideo, regioVan, samengevoegd, type Filters, type Uitkomst } from "./filters";

function Chip({ on, onClick, children, n }: { on: boolean; onClick: () => void; children: React.ReactNode; n?: number }) {
  return (
    <button type="button" className={`fchip ${on ? "on" : ""}`} aria-pressed={on} onClick={onClick}>
      <span>{children}</span>
      {n != null ? <span className="tnum fchip-n">{n}</span> : null}
    </button>
  );
}

export function FilterBlad({
  f,
  set,
  reset,
  u,
  bron,
  catBron,
  vorig,
  alles,
  video,
  onClose,
}: {
  f: Filters;
  set: (p: Partial<Filters>) => void;
  reset: () => void;
  u: Uitkomst | null;
  bron: Item[];
  catBron: Item[];
  vorig: number;
  alles: boolean;
  video?: boolean;
  onClose: () => void;
}) {
  const [closing, setClosing] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return onClose();
    setClosing(true);
    window.setTimeout(onClose, 360);
  }, [onClose]);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    closeBtn.current?.focus({ preventScroll: true });
    return () => {
      window.removeEventListener("keydown", onKey);
      prev?.focus?.({ preventScroll: true });
    };
  }, [close]);
  const tel = useMemo(() => {
    const c: Record<string, number> = {};
    for (const it of catBron) c["cat:" + it.cat] = (c["cat:" + it.cat] || 0) + 1;
    for (const it of bron) {
      c["regio:" + regioVan(it)] = (c["regio:" + regioVan(it)] || 0) + 1;
      if (heeftVideo(it)) c.video = (c.video || 0) + 1;
      if (samengevoegd(it)) c.samen = (c.samen || 0) + 1;
    }
    return c;
  }, [bron, catBron]);
  const toggle = <T,>(arr: T[], x: T) => (arr.includes(x) ? arr.filter((y) => y !== x) : [...arr, x]);
  const isStd = JSON.stringify(f) === JSON.stringify(STANDAARD);
  return createPortal(
    <div className="app modal-root">
      <div className={`sheet-root ${closing ? "out" : ""}`} role="dialog" aria-modal="true" aria-labelledby="filter-titel">
        <button className="scrim" aria-label="Sluit filters" tabIndex={-1} onClick={close} />
        <div className="sheet fsheet" ref={panel} onAnimationEnd={(e) => closing && e.target === panel.current && onClose()}>
          <div className="sh-head">
            <span className="grab" aria-hidden="true" />
            <div className="sh-row">
              <h2 id="filter-titel" className="sh-title">Filters</h2>
              <button ref={closeBtn} type="button" className="iconbtn" aria-label="Sluit filters" onClick={close}>
                <Icon name="x" />
              </button>
            </div>
            <div className="sh-bar">
              <span className="sh-state">{u ? `${u.items.length} ${u.items.length === 1 ? "bericht" : "berichten"}` : "Tijd geldt ook voor filmpjes"}</span>
              <button type="button" className="textbtn" onClick={reset} disabled={isStd}>
                Standaard
              </button>
            </div>
          </div>
          <div className="sh-body fbody">
            <section className="fgroup" aria-labelledby="f-tijd">
              <h3 id="f-tijd" className="kicker">Tijd</h3>
              <div className="fchips">
                <Chip on={f.tijd === "auto"} onClick={() => set({ tijd: "auto" })}>
                  Automatisch{u && f.tijd === "auto" ? ` (${TIJD_LABEL[u.tijd].toLowerCase()})` : ""}
                </Chip>
                {(["sinds", "vandaag", "1u", "3u", "alles"] as const).filter((t) => t !== "sinds" || vorig > 0).map((t) => (
                  <Chip key={t} on={f.tijd === t} onClick={() => set({ tijd: t })} n={u?.per[t]}>
                    {TIJD_LABEL[t]}
                  </Chip>
                ))}
              </div>
              <p className="fhint">Automatisch: sinds je laatste bezoek als er sindsdien genoeg nieuw is, anders vandaag (net na middernacht: alles).</p>
            </section>
            {video ? null : (
              <>
                {alles ? (
                  <section className="fgroup" aria-labelledby="f-cat">
                    <h3 id="f-cat" className="kicker">Rubriek (bij Alles)</h3>
                    <div className="fchips">
                      {CAT_OPT.map((c) => (
                        <Chip key={c.id} on={f.cats.includes(c.id)} onClick={() => set({ cats: toggle(f.cats, c.id) })} n={tel["cat:" + c.id] || 0}>
                          {c.label}
                        </Chip>
                      ))}
                    </div>
                  </section>
                ) : null}
                <section className="fgroup" aria-labelledby="f-regio">
                  <h3 id="f-regio" className="kicker">Regio</h3>
                  <div className="fchips">
                    {(["haarlem", "nl", "wereld"] as const).map((r) => (
                      <Chip key={r} on={f.regio.includes(r)} onClick={() => set({ regio: toggle(f.regio, r) })} n={tel["regio:" + r] || 0}>
                        {REGIO_LABEL[r]}
                      </Chip>
                    ))}
                  </div>
                </section>
                <section className="fgroup" aria-labelledby="f-soort">
                  <h3 id="f-soort" className="kicker">Alleen</h3>
                  <div className="fchips">
                    <Chip on={f.video} onClick={() => set({ video: !f.video })} n={tel.video || 0}>
                      Met video
                    </Chip>
                    <Chip on={f.samen} onClick={() => set({ samen: !f.samen })} n={tel.samen || 0}>
                      Uit meerdere bronnen
                    </Chip>
                  </div>
                </section>
                <section className="fgroup" aria-labelledby="f-sort">
                  <h3 id="f-sort" className="kicker">Volgorde</h3>
                  <div className="fchips">
                    <Chip on={f.sort === "nieuw"} onClick={() => set({ sort: "nieuw" })}>
                      Nieuwste eerst
                    </Chip>
                    <Chip on={f.sort === "oud"} onClick={() => set({ sort: "oud" })}>
                      Oudste eerst
                    </Chip>
                    <Chip on={f.sort === "bronnen"} onClick={() => set({ sort: "bronnen" })}>
                      Meeste bronnen
                    </Chip>
                  </div>
                </section>
              </>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
