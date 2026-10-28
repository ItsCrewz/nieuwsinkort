import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Bron } from "./types";
import type { SourceGroup, SourceRow } from "./sources";

const hhmm = (iso?: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(+d)) return "";
  const opt: Intl.DateTimeFormatOptions = { timeZone: "Europe/Amsterdam", hour: "2-digit", minute: "2-digit" };
  const day = (x: Date) => x.toLocaleDateString("nl-NL", { timeZone: "Europe/Amsterdam" });
  return day(d) === day(new Date()) ? d.toLocaleTimeString("nl-NL", opt) : d.toLocaleDateString("nl-NL", { timeZone: "Europe/Amsterdam", weekday: "short", day: "numeric", month: "short", ...(Date.now() - +d > 300 * 864e5 ? { weekday: undefined, year: "numeric" } : {}) });
};

/** Tekst per bron. "Vandaag niets" alleen als de feed zelf vandaag echt niets publiceerde. */
function sourceLine(s: SourceRow): string {
  const inOverzicht = s.count ? `${s.count} in overzicht` : "";
  const st = s.stat;
  if (!st) return inOverzicht || "Niet in overzicht"; // oude data.json zonder bronstats: niets beweren over 'vandaag'
  if (st.vandaag == null) return ["Feed niet bereikbaar", inOverzicht].filter(Boolean).join(" · ");
  if (st.vandaag === 0) return `Vandaag niets${st.laatste ? ` · laatste ${hhmm(st.laatste)}` : ""}`;
  return [`${st.vandaag} vandaag`, inOverzicht].filter(Boolean).join(" · ");
}
import { Icon } from "./icons";
import { Switch } from "./ui";

const motionOK = () => !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Paneel met alle bronnen; rechts op desktop, onderaan (bottom sheet) op mobiel. */
export function SourcesSheet({
  groups,
  weer,
  off,
  setMany,
  reset,
  onClose,
}: {
  groups: SourceGroup[];
  weer: Bron[];
  off: Set<string>;
  setMany: (keys: string[], on: boolean) => void;
  reset: () => void;
  onClose: () => void;
}) {
  const [closing, setClosing] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const close = () => {
    if (!motionOK()) return onClose();
    setClosing(true);
    window.setTimeout(onClose, 360); // vangnet als animationend niet komt
  };
  useEffect(() => {
    const prevFocus = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeBtn.current?.focus({ preventScroll: true });
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      prevFocus?.focus?.({ preventScroll: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const nOff = off.size;
  return createPortal(
    <div className="app modal-root">
      <div className={`sheet-root ${closing ? "out" : ""}`} role="dialog" aria-modal="true" aria-labelledby="bronnen-titel">
        <button className="scrim" aria-label="Sluit bronnen" tabIndex={-1} onClick={close} />
        <div
          className="sheet"
          ref={panel}
          onAnimationEnd={(e) => {
            if (closing && e.target === panel.current) onClose();
          }}
        >
          <div className="sh-head">
            <span className="grab" aria-hidden="true" />
            <div className="sh-row">
              <h2 id="bronnen-titel" className="sh-title">Bronnen</h2>
              <button ref={closeBtn} type="button" className="iconbtn" aria-label="Sluit bronnen" onClick={close}>
                <Icon name="x" />
              </button>
            </div>
            <p className="sh-intro">
              Alles wat deze site leest, per rubriek. Zet een bron uit om de berichten ervan te verbergen. Een bericht verdwijnt pas als
              al zijn bronnen uit staan.
            </p>
            <div className="sh-bar">
              <span className="sh-state">{nOff ? `${nOff} ${nOff === 1 ? "bron" : "bronnen"} uit` : "Alle bronnen staan aan"}</span>
              <button type="button" className="textbtn" onClick={reset} disabled={!nOff}>
                Alles weer aan
              </button>
            </div>
          </div>
          <div className="sh-body">
            {groups.map((g) => {
              const keys = g.sources.map((s) => s.key);
              const nOn = keys.filter((k) => !off.has(k)).length;
              const state: boolean | "mixed" = nOn === keys.length ? true : nOn === 0 ? false : "mixed";
              return (
                <section key={g.id} className={`sh-group cat-${g.id}`} aria-labelledby={`grp-${g.id}`}>
                  <div className="sh-ghead">
                    <div>
                      <h3 id={`grp-${g.id}`} className="kicker">
                                                {g.label}
                      </h3>
                      <span className="sh-gmeta">
                        {g.sources.length} {g.sources.length === 1 ? "bron" : "bronnen"} ·{" "}
                        {g.published != null ? `${g.published} berichten vandaag` : `${g.total} in overzicht`}
                      </span>
                    </div>
                    <label className="sh-all">
                      <span>Alles</span>
                      <Switch checked={state} label={`Alle bronnen in ${g.label}`} onChange={(on) => setMany(keys, on)} />
                    </label>
                  </div>
                  <ul className="sh-list">
                    {g.sources.map((s) => {
                      const on = !off.has(s.key);
                      return (
                        <li key={s.key} className={on ? "" : "is-off"}>
                          <div className="sh-name">
                            <span>{s.naam}</span>
                            <small>
                              <span className="tnum">{sourceLine(s)}</span>
                              {s.info ? ` · ${s.info}` : ""}
                            </small>
                          </div>
                          <Switch checked={on} label={`${s.naam} (${g.label})`} onChange={(v) => setMany([s.key], v)} />
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
            {weer.length ? (
              <section className="sh-group" aria-labelledby="grp-weer">
                <div className="sh-ghead">
                  <div>
                    <h3 id="grp-weer" className="kicker">
                                            Weer
                    </h3>
                    <span className="sh-gmeta">Altijd aan</span>
                  </div>
                </div>
                <ul className="sh-list">
                  {weer.map((b) => (
                    <li key={b.href}>
                      <a className="sh-name" href={b.href} target="_blank" rel="noreferrer">
                        <span>{b.site}</span>
                      </a>
                      <Icon name="ext" className="sm muted" />
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
