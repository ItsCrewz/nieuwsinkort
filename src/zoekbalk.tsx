import { Icon } from "./icons";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import { staatFocusInInvoer } from "./zoekfocus";
import { normaliseer, resultaatTekst, verborgenTekst } from "./zoek";
import { touchNu } from "./invoer";

const zoekAanwijzing = "Voer letters of cijfers in om te zoeken.";

// scope: zichtbare zoekscope; verborgen: treffers die filters wegnemen; wisFilters alleen als er beperkende filters zijn.
export type ZoekScope = { tekst: string; verborgen: number; wisFilters?: () => void };
const scopeId = "zoek-scope";

export function Zoekbalk({ query, onChange, aantal, invoer, scope }: { query: string; onChange: (query: string) => void; aantal: number; invoer: React.RefObject<HTMLInputElement>; scope?: ZoekScope }) {
  const [open, setOpen] = useState(!!query);
  useEffect(() => { if (query) setOpen(true); }, [query]);
  const [melding, setMelding] = useState<{ query: string; aantal: number } | null>(null);
  const verborgen = scope?.verborgen ?? 0;
  const scopeMelding = scope ? `. ${scope.tekst}${verborgen ? `. ${verborgenTekst(verborgen)}` : ""}` : "";
  useEffect(() => {
    if (!open || !query.trim()) return;
    const timer = window.setTimeout(() => setMelding({ query, aantal }), 400);
    return () => { window.clearTimeout(timer); setMelding(null); };
  }, [open, query, aantal, scope?.tekst, verborgen]);
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
      {open && <ZoekFormulier query={query} onChange={onChange} sluit={sluit} invoer={invoer} scope={scope} />}
      <span className="zoek-status" aria-live="polite">{query.trim() && !normaliseer(query) ? zoekAanwijzing : open && query.trim() && melding?.query === query && melding.aantal === aantal ? resultaatTekst(aantal) + scopeMelding : ""}</span>
    </div>
  );
}

export function ZoekFormulier({ query, onChange, sluit, invoer, scope }: { query: string; onChange: (query: string) => void; sluit: () => void; invoer: React.RefObject<HTMLInputElement>; scope?: ZoekScope }) {
  const compositie = useRef(false);
  return <form className="zoek-formulier" role="search" onSubmit={(e) => { e.preventDefault(); if (!compositie.current && touchNu()) invoer.current?.blur(); }}>
        <input ref={invoer} className="zoek-invoer" type="search" enterKeyHint="search" aria-label="Zoek in het nieuws"{...(scope ? { "aria-describedby": scopeId } : {})} value={query} onChange={(e) => onChange(e.target.value)} onCompositionStart={() => { compositie.current = true; }} onCompositionEnd={() => { compositie.current = false; }} onBlur={() => { compositie.current = false; }} onKeyDown={(e) => {
          if (e.key === "Enter" && (compositie.current || e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229)) { e.preventDefault(); return; }
          if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); sluit(); }
        }} />
        <button type="button" className="zoek-sluit" onClick={sluit}>Sluiten</button>
        {scope && <div id={scopeId} className="zoek-scope">
          <span>{scope.tekst}{scope.verborgen && query.trim() ? ` · ${verborgenTekst(scope.verborgen)}` : ""}</span>
          {scope.wisFilters && <button type="button" className="zoek-wis-filters" onClick={scope.wisFilters}>Wis filters</button>}
        </div>}
      </form>;
}

export function ZoekLeeg({ query, onWis, verborgen = 0, onWisFilters }: { query: string; onWis: () => void; verborgen?: number; onWisFilters?: () => void }) {
  const zoekbaar = !!normaliseer(query);
  return <div className="zoek-leeg">{zoekbaar ? <>Niets gevonden voor “{query}”</> : zoekAanwijzing}{zoekbaar && verborgen > 0 && <> · {verborgenTekst(verborgen)}</>} <button type="button" className="zoek-wis" onClick={onWis}>Wis zoekopdracht</button>{zoekbaar && verborgen > 0 && onWisFilters && <button type="button" className="zoek-wis" onClick={onWisFilters}>Wis filters en zoek opnieuw</button>}</div>;
}
