import { Icon } from "./icons";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { aantalExtra, CAT_OPT, TIJD_LABEL, type Filters, type Tijd } from "./filters";
import { CATS } from "./tabs";
import type { View } from "./types";

/** Waarin gezocht wordt en wat het resultaat beperkt (rubriek, tijd, bronnen, extra filters, Politiek op Home). Pure functie, getest. */
export type ZoekScope = { scope: string; beperkt: string[] };
export function zoekScope(view: View, f: Filters, tijd: Exclude<Tijd, "auto">, bronnenUit: number): ZoekScope {
  const alles = view === "alles";
  const label = (id: string) => CAT_OPT.find((c) => c.id === id)?.label ?? CATS.find((c) => c.id === id)?.label ?? id;
  const scope = !alles ? `rubriek ${label(view)}` : f.cats.length ? `rubrieken ${f.cats.map(label).join(", ")}` : "Home (zonder Politiek)";
  const beperkt: string[] = [];
  if (tijd !== "alles") beperkt.push(`tijdfilter ${TIJD_LABEL[tijd]}`);
  if (bronnenUit) beperkt.push(`${bronnenUit} ${bronnenUit === 1 ? "bron" : "bronnen"} uit`);
  const extra = aantalExtra(f, false); // rubriekkeuze staat al in `scope`
  if (extra) beperkt.push(`${extra} ${extra === 1 ? "extra filter" : "extra filters"}`);
  if (alles && !f.cats.length) beperkt.push("Politiek niet inbegrepen");
  return { scope, beperkt };
}
/** Eén zin voor scherm en schermlezer; bij `breed` zijn de filters voor deze zoekopdracht genegeerd. */
export const scopeZin = (s: ZoekScope, breed: boolean) => breed ? "Zoekt in alle rubrieken en bronnen, zonder filters (je filterkeuzes blijven staan)" : `Zoekt in ${s.scope}${s.beperkt.length ? `. Beperkt door: ${s.beperkt.join(", ")}` : ""}`;

export type ZoekProps = { scope?: ZoekScope; breed?: boolean; onBreed?: (breed: boolean) => void };

export function Zoekbalk({ query, onChange, aantal, scope, breed = false, onBreed }: { query: string; onChange: (query: string) => void; aantal: number } & ZoekProps) {
  const [open, setOpen] = useState(!!query);
  const knop = useRef<HTMLButtonElement>(null);
  const invoer = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) invoer.current?.focus(); }, [open]);
  const sluit = () => { onChange(""); onBreed?.(false); setOpen(false); knop.current?.focus(); };
  // Buiten .shell renderen (container-type:inline-size), anders scrolt de vaste knop mee, net als de deelknop.
  const knopEl = <button ref={knop} type="button" className="zoek-knop" aria-expanded={open} aria-label="Zoeken" title="Zoeken" onClick={() => open ? sluit() : setOpen(true)}><Icon name="search" /></button>;
  return (
    <div className="zoek-container">
      {typeof document === "undefined" ? knopEl : createPortal(knopEl, document.body)}
      {open && <ZoekFormulier query={query} onChange={onChange} sluit={sluit} invoer={invoer} scope={scope} breed={breed} onBreed={onBreed} />}
      <span className="zoek-status" aria-live="polite">{query.trim() ? `${aantal} ${aantal === 1 ? "resultaat" : "resultaten"}${scope ? `. ${scopeZin(scope, breed)}` : ""}` : ""}</span>
    </div>
  );
}

export function ZoekFormulier({ query, onChange, sluit, invoer, scope, breed = false, onBreed }: { query: string; onChange: (query: string) => void; sluit: () => void; invoer: React.RefObject<HTMLInputElement> } & ZoekProps) {
  return <form className="zoek-formulier" role="search" onSubmit={(e) => { e.preventDefault(); invoer.current?.blur(); }}>
        <input ref={invoer} className="zoek-invoer" type="search" enterKeyHint="search" aria-label="Zoek in het nieuws" aria-describedby={scope ? "zoek-scope" : undefined} value={query} onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => {
          if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); sluit(); }
        }} />
        <button type="button" className="zoek-sluit" onClick={sluit}>Sluiten</button>
        {scope && <p id="zoek-scope" className="zoek-scope">{scopeZin(scope, breed)}.{onBreed && (breed || scope.beperkt.length > 0) && <> <button type="button" className="zoek-wis" aria-pressed={breed} onClick={() => onBreed(!breed)}>{breed ? "Filters weer gebruiken" : "Zoek zonder filters"}</button></>}</p>}
      </form>;
}

export function ZoekLeeg({ query, onWis, scope, breed = false, onBreed }: { query: string; onWis: () => void } & ZoekProps) {
  return <div className="zoek-leeg" role="status">Geen berichten gevonden voor ‘{query}’{scope ? <>. {scopeZin(scope, breed)}.</> : null} {onBreed && !breed && scope && scope.beperkt.length > 0 && <button type="button" className="zoek-wis" onClick={() => onBreed(true)}>Zoek zonder filters</button>}<button type="button" className="zoek-wis" onClick={onWis}>Wis zoekopdracht</button></div>;
}
