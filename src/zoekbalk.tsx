import { Icon } from "./icons";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import { staatFocusInInvoer } from "./zoekfocus";
import { normaliseer, resultaatTekst } from "./zoek";

const zoekAanwijzing = "Voer letters of cijfers in om te zoeken.";

export function Zoekbalk({ query, onChange, aantal, invoer }: { query: string; onChange: (query: string) => void; aantal: number; invoer: React.RefObject<HTMLInputElement> }) {
  const [open, setOpen] = useState(!!query);
  const [melding, setMelding] = useState<{ query: string; aantal: number } | null>(null);
  useEffect(() => {
    if (!open || !query.trim()) return;
    const timer = window.setTimeout(() => setMelding({ query, aantal }), 400);
    return () => { window.clearTimeout(timer); setMelding(null); };
  }, [open, query, aantal]);
  const knop = useRef<HTMLButtonElement>(null);
  const focusBijOpenen = useRef(false);
  const sluit = useCallback(() => { onChange(""); setOpen(false); knop.current?.focus(); }, [onChange]);
  useEffect(() => { if (open && focusBijOpenen.current) { focusBijOpenen.current = false; invoer.current?.focus(); } }, [open]);
  useEffect(() => {
    const toets = (e: KeyboardEvent) => {
      if (document.querySelector('[aria-modal="true"]')) return;
      if (e.key === "Escape" && open) {
        e.preventDefault();
        e.stopPropagation();
        sluit();
      } else if (e.key === "/" && !open && !e.ctrlKey && !e.metaKey && !e.altKey && !e.isComposing &&
        window.matchMedia("(hover: hover) and (pointer: fine)").matches && !staatFocusInInvoer(document.activeElement as HTMLElement | null)) {
        e.preventDefault();
        focusBijOpenen.current = true;
        setOpen(true);
      }
    };
    document.addEventListener("keydown", toets);
    return () => document.removeEventListener("keydown", toets);
  }, [open, sluit]);
  // Buiten .shell renderen (container-type:inline-size), anders scrolt de vaste knop mee, net als de deelknop.
  const knopEl = <button ref={knop} type="button" className="zoek-knop" aria-expanded={open} aria-label="Zoeken" title="Zoeken" onClick={() => { if (open) sluit(); else { focusBijOpenen.current = true; setOpen(true); } }}><Icon name="search" /></button>;
  return (
    <div className="zoek-container">
      {typeof document === "undefined" ? knopEl : createPortal(knopEl, document.body)}
      {open && <ZoekFormulier query={query} onChange={onChange} sluit={sluit} invoer={invoer} />}
      <span className="zoek-status" aria-live="polite">{query.trim() && !normaliseer(query) ? zoekAanwijzing : open && query.trim() && melding?.query === query && melding.aantal === aantal ? resultaatTekst(aantal) : ""}</span>
    </div>
  );
}

export function ZoekFormulier({ query, onChange, sluit, invoer }: { query: string; onChange: (query: string) => void; sluit: () => void; invoer: React.RefObject<HTMLInputElement> }) {
  return <form className="zoek-formulier" role="search" onSubmit={(e) => { e.preventDefault(); invoer.current?.blur(); }}>
        <input ref={invoer} className="zoek-invoer" type="search" enterKeyHint="search" aria-label="Zoek in het nieuws" value={query} onChange={(e) => onChange(e.target.value)} />
        <button type="button" className="zoek-sluit" onClick={sluit}>Sluiten</button>
      </form>;
}

export function ZoekLeeg({ query, onWis }: { query: string; onWis: () => void }) {
  return <div className="zoek-leeg">{normaliseer(query) ? <>Niets gevonden voor “{query}”</> : zoekAanwijzing} <button type="button" className="zoek-wis" onClick={onWis}>Wis zoekopdracht</button></div>;
}
