import { Icon } from "./icons";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { staatFocusInInvoer } from "./zoekfocus";
import { begrensZoekterm, MAX_ZOEKTEKENS, normaliseer, resultaatTekst, verborgenTekst, type Zoekmodus } from "./zoek";
import { touchNu } from "./invoer";

const zoekAanwijzing = "Voer letters of cijfers in om te zoeken.";

// scope: zichtbare zoekscope; verborgen: treffers die filters wegnemen; wisFilters alleen als er beperkende filters zijn.
export type ZoekScope = { tekst: string; verborgen: number; wisFilters?: () => void; herstel?: () => void };
const scopeId = "zoek-scope";
const hintId = "zoek-hint";
const uitsluitTip = "Tip: zet een minteken voor een woord om het uit te sluiten, bijv. verkiezing -amerika.";
// Het feedgebied in App.tsx; de link "Ga naar resultaten" focust daarbinnen de eerste kaartlink.
export const resultatenId = "zoek-resultaten";
type FocusDoc = { getElementById(id: string): { focus(): void; querySelector(s: string): { focus(): void; querySelector(s: string): { focus(): void } | null } | null } | null };
// Focus op de eerste link van de eerste kaart, zodat de weerlinks in .nc-head niet voor de resultaten komen; zonder gemounte kaart op het gebied zelf.
export function focusResultaten(doc: FocusDoc) {
  const gebied = doc.getElementById(resultatenId);
  (gebied?.querySelector(".nc")?.querySelector("a[href]") ?? gebied)?.focus();
}

export function Zoekbalk({ query, onChange, aantal, invoer, scope, modus = "alle", onModus = () => {} }: { modus?: Zoekmodus; onModus?: (modus: Zoekmodus) => void; query: string; onChange: (query: string) => void; aantal: number; invoer: React.RefObject<HTMLInputElement>; scope?: ZoekScope }) {
  const [open, setOpen] = useState(!!query);
  const formId = useId();
  useEffect(() => { if (query) setOpen(true); }, [query]);
  const [melding, setMelding] = useState<{ query: string; aantal: number } | null>(null);
  const verborgen = scope?.verborgen ?? 0;
  const scopeMelding = scope ? `. ${scope.tekst}${verborgen ? `. ${verborgenTekst(verborgen)}` : ""}` : "";
  useEffect(() => {
    if (!open || !query.trim()) return;
    const timer = window.setTimeout(() => setMelding({ query, aantal }), 400);
    return () => { window.clearTimeout(timer); setMelding(null); };
  }, [open, query, aantal, scope?.tekst, verborgen, modus]);
  const knop = useRef<HTMLButtonElement>(null);
  const focusBijOpenen = useRef(false);
  const sluit = useCallback(() => { onChange(""); setOpen(false); knop.current?.focus(); }, [onChange]);
  useEffect(() => { if (open && focusBijOpenen.current) { focusBijOpenen.current = false; invoer.current?.focus(); } }, [open]);
  useEffect(() => {
    const toets = (e: KeyboardEvent) => {
      if (document.querySelector('[aria-modal="true"]')) return;
      if (e.key === "Escape" && open && !e.isComposing && e.keyCode !== 229) {
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
  const knopEl = <button ref={knop} type="button" className="zoek-knop" aria-expanded={open} {...(open ? { "aria-controls": formId } : {})} aria-label="Zoeken" title="Zoeken" onClick={() => { if (open) sluit(); else { focusBijOpenen.current = true; setOpen(true); } }}><Icon name="search" /></button>;
  return (
    <div className="zoek-container">
      {typeof document === "undefined" ? knopEl : createPortal(knopEl, document.body)}
      {open && <ZoekFormulier id={formId} query={query} onChange={onChange} sluit={sluit} invoer={invoer} scope={scope} aantal={aantal} modus={modus} onModus={onModus} />}
      <span className="zoek-status" aria-live="polite">{query.trim() && !normaliseer(query) ? zoekAanwijzing : open && query.trim() && melding?.query === query && melding.aantal === aantal ? resultaatTekst(aantal) + (modus === "of" ? " · één van de zoektermen (OF)" : " · alle zoektermen") + scopeMelding : ""}</span>
    </div>
  );
}

export function ZoekFormulier({ id, query, onChange, sluit, invoer, scope, aantal = 0, modus = "alle", onModus = () => {} }: { modus?: Zoekmodus; onModus?: (modus: Zoekmodus) => void; id?: string; query: string; onChange: (query: string) => void; sluit: () => void; invoer: React.RefObject<HTMLInputElement>; scope?: ZoekScope; aantal?: number }) {
  const compositie = useRef(false);
  // Geen maxLength: dat kapt plakken stil af en kan IME-invoer storen; hier melden we het wel, alleen als er echt tekst is weggegooid.
  const [ingekort, setIngekort] = useState(false);
  const wijzig = (tekst: string) => { const begrensd = begrensZoekterm(tekst); setIngekort(begrensd !== tekst); onChange(begrensd); };
  return <form id={id} className="zoek-formulier" role="search" onSubmit={(e) => { e.preventDefault(); if (!compositie.current && touchNu()) invoer.current?.blur(); }}>
        <input ref={invoer} className="zoek-invoer" type="search" enterKeyHint="search" aria-label="Zoek in het nieuws" aria-describedby={scope ? scopeId : hintId} value={query} onChange={(e) => wijzig(e.target.value)} onCompositionStart={() => { compositie.current = true; }} onCompositionEnd={() => { compositie.current = false; }} onBlur={() => { compositie.current = false; }} onKeyDown={(e) => {
          if (e.key === "Enter" && (compositie.current || e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229)) { e.preventDefault(); return; }
          if (e.key === "Escape") {
            e.stopPropagation();
            if (compositie.current || e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return;
            e.preventDefault(); sluit();
          }
        }} />
        <button type="button" className="zoek-sluit" onClick={sluit}>Sluiten</button>
        <span className="zoek-scope" role="status">{ingekort && query ? `Zoekopdracht ingekort tot ${MAX_ZOEKTEKENS} tekens` : ""}</span>
        <label className="zoek-scope"><input type="checkbox" checked={modus === "of"} onChange={(e) => onModus(e.target.checked ? "of" : "alle")} /> Vind één van de zoektermen (OF)</label>
        {!!normaliseer(query) && <span className="zoek-scope">{resultaatTekst(aantal)} · {modus === "of" ? "één van de zoektermen (OF)" : "alle zoektermen"}</span>}
        {aantal > 0 && !!normaliseer(query) && <a href={`#${resultatenId}`} className="zoek-wis-filters zoek-naar-resultaten" onClick={(e) => { e.preventDefault(); focusResultaten(document); }}>Ga naar resultaten ({aantal})</a>}
        {!scope && <span id={hintId} className="zoek-scope">{uitsluitTip}</span>}
        {scope && <div id={scopeId} className="zoek-scope">
          <span>{scope.tekst}{scope.verborgen && query.trim() ? ` · ${verborgenTekst(scope.verborgen)}` : ""}</span>
          {scope.herstel && <button type="button" className="zoek-wis-filters" onClick={scope.herstel}>Terug naar eerdere selectie</button>}
          {scope.wisFilters && <button type="button" className="zoek-wis-filters" onClick={scope.wisFilters}>Wis filters</button>}
          <span>{uitsluitTip}</span>
        </div>}
      </form>;
}

export function ZoekLeeg({ query, onWis, verborgen = 0, onWisFilters, onZoekAlles, suggesties = [], onSuggestie }: { query: string; onWis: () => void; verborgen?: number; onWisFilters?: () => void; onZoekAlles?: () => void; suggesties?: string[]; onSuggestie?: (term: string) => void }) {
  const zoekbaar = !!normaliseer(query);
  return <div className="zoek-leeg">{zoekbaar ? <>Niets gevonden voor “{query}”</> : zoekAanwijzing}{zoekbaar && verborgen > 0 && <> · {verborgenTekst(verborgen)}</>}{suggesties.length > 0 && <div role="group" aria-label="Zoeksuggesties">Zoeksuggesties: {suggesties.map((term) => <button type="button" className="zoek-wis" key={term} onClick={() => onSuggestie?.(term)}>{term}</button>)}</div>} <button type="button" className="zoek-wis" onClick={onWis}>Wis zoekopdracht</button>{zoekbaar && onZoekAlles && <button type="button" className="zoek-wis" onClick={onZoekAlles}>Zoek in alle rubrieken en beschikbare berichten</button>}{zoekbaar && verborgen > 0 && onWisFilters && <button type="button" className="zoek-wis" onClick={onWisFilters}>Wis filters en zoek opnieuw</button>}</div>;
}
