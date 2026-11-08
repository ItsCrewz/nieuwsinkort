import { Icon } from "./icons";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { staatFocusInInvoer } from "./zoekfocus";
import { normaliseer } from "./zoek";

const zoekAanwijzing = "Voer letters of cijfers in om te zoeken.";

export function Zoekbalk({ query, onChange, aantal }: { query: string; onChange: (query: string) => void; aantal: number }) {
  const [open, setOpen] = useState(!!query);
  const knop = useRef<HTMLButtonElement>(null);
  const invoer = useRef<HTMLInputElement>(null);
  const focusBijOpenen = useRef(false);
  useEffect(() => { if (open && focusBijOpenen.current) { focusBijOpenen.current = false; invoer.current?.focus(); } }, [open]);
  useEffect(() => {
    const toets = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) {
        e.preventDefault();
        e.stopPropagation();
        onChange("");
        setOpen(false);
        knop.current?.focus();
      } else if (e.key === "/" && !open && !e.ctrlKey && !e.metaKey && !e.altKey && !e.isComposing &&
        window.matchMedia("(hover: hover) and (pointer: fine)").matches && !staatFocusInInvoer(document.activeElement as HTMLElement | null)) {
        e.preventDefault();
        focusBijOpenen.current = true;
        setOpen(true);
      }
    };
    document.addEventListener("keydown", toets);
    return () => document.removeEventListener("keydown", toets);
  }, [open, onChange]);
  const sluit = () => { onChange(""); setOpen(false); knop.current?.focus(); };
  // Buiten .shell renderen (container-type:inline-size), anders scrolt de vaste knop mee, net als de deelknop.
  const knopEl = <button ref={knop} type="button" className="zoek-knop" aria-expanded={open} aria-label="Zoeken" title="Zoeken" onClick={() => { if (open) sluit(); else { focusBijOpenen.current = true; setOpen(true); } }}><Icon name="search" /></button>;
  return (
    <div className="zoek-container">
      {typeof document === "undefined" ? knopEl : createPortal(knopEl, document.body)}
      {open && <ZoekFormulier query={query} onChange={onChange} sluit={sluit} invoer={invoer} />}
      <span className="zoek-status" aria-live="polite">{query.trim() ? normaliseer(query) ? `${aantal} ${aantal === 1 ? "resultaat" : "resultaten"}` : zoekAanwijzing : ""}</span>
    </div>
  );
}

export function ZoekFormulier({ query, onChange, sluit, invoer }: { query: string; onChange: (query: string) => void; sluit: () => void; invoer: React.RefObject<HTMLInputElement> }) {
  return <form className="zoek-formulier" role="search" onSubmit={(e) => { e.preventDefault(); invoer.current?.blur(); }}>
        <input ref={invoer} className="zoek-invoer" type="search" enterKeyHint="search" aria-label="Zoek in het nieuws" value={query} onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => {
          if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); sluit(); }
        }} />
        <button type="button" className="zoek-sluit" onClick={sluit}>Sluiten</button>
      </form>;
}

export function ZoekLeeg({ query, onWis }: { query: string; onWis: () => void }) {
  return <div className="zoek-leeg">{normaliseer(query) ? <>Geen berichten gevonden voor ‘{query}’</> : zoekAanwijzing} <button type="button" className="zoek-wis" onClick={onWis}>Wis zoekopdracht</button></div>;
}
