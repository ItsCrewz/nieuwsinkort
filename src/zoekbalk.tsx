import { Icon } from "./icons";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { staatFocusInInvoer } from "./zoekfocus";
import { begrensZoekterm, type BronOptie, MAX_ZOEKTEKENS, normaliseer, resultaatTekst, verborgenTekst, type Zoekmodus } from "./zoek";
import { touchNu } from "./invoer";

const zoekAanwijzing = "Voer letters of cijfers in om te zoeken.";

// scope: zichtbare zoekscope; verborgen: treffers die filters wegnemen; wisFilters alleen als er beperkende filters zijn.
export type ZoekBron = { opties: BronOptie[]; gekozen: string; label?: string; onKies: (sleutel: string) => void; gewist?: string };
export type ZoekScope = { tekst: string; verborgen: number; wisFilters?: () => void; herstel?: () => void; bron?: ZoekBron };
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

type KaartEl = { querySelector(s: string): { focus(): void } | null; scrollIntoView?(o?: { block: "start" }): void };
type NavDoc = { getElementById(id: string): { querySelectorAll(s: string): ArrayLike<KaartEl> } | null };
// Focus op de link van kaart k. Kaarten buiten het venster met inhoud hebben nog geen link: scroll er eerst heen en probeer het opnieuw (de feed mount dan de inhoud).
export function naarResultaat(doc: NavDoc, k: number, wacht: (f: () => void) => void = (f) => { window.setTimeout(f, 120); }, pogingen = 5): boolean {
  const kaart = doc.getElementById(resultatenId)?.querySelectorAll(".nc")[k];
  if (!kaart) return false;
  const link = kaart.querySelector("a[href]");
  if (link) { link.focus(); return true; }
  if (pogingen > 0) { kaart.scrollIntoView?.({ block: "start" }); wacht(() => { naarResultaat(doc, k, wacht, pogingen - 1); }); }
  return false;
}
// Tekst voor de aria-live-regel van de resultaatnavigatie (k is 0-gebaseerd).
export function navTekst(k: number, aantal: number, poging?: "eerste" | "laatste") {
  return poging === "eerste" ? "Eerste resultaat" : poging === "laatste" ? "Laatste resultaat" : `Resultaat ${k + 1} van ${aantal}`;
}

export function Zoekbalk({ query, onChange, aantal, invoer, scope, alleenKoppen = false, onAlleenKoppen, modus = "alle", onModus = () => {}, heleWoorden = false, onHeleWoorden }: { heleWoorden?: boolean; onHeleWoorden?: (waarde: boolean) => void; alleenKoppen?: boolean; onAlleenKoppen?: (waarde: boolean) => void; modus?: Zoekmodus; onModus?: (modus: Zoekmodus) => void; query: string; onChange: (query: string) => void; aantal: number; invoer: React.RefObject<HTMLInputElement>; scope?: ZoekScope }) {
  const [open, setOpen] = useState(!!query);
  const formId = useId();
  useEffect(() => { if (query) setOpen(true); }, [query]);
  const [melding, setMelding] = useState<{ query: string; aantal: number } | null>(null);
  const verborgen = scope?.verborgen ?? 0;
  const scopeMelding = scope ? `. ${scope.tekst}${verborgen ? `. ${verborgenTekst(verborgen)}` : ""}${scope.bron?.gewist ? `. Bron ${scope.bron.gewist} is uitgezet; er wordt nu in alle bronnen gezocht` : ""}` : "";
  useEffect(() => {
    if (!open || !query.trim()) return;
    const timer = window.setTimeout(() => setMelding({ query, aantal }), 400);
    return () => { window.clearTimeout(timer); setMelding(null); };
  }, [open, query, aantal, scope?.tekst, verborgen, modus, alleenKoppen, heleWoorden]);
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
  const knopEl = <><button ref={knop} type="button" className="zoek-knop" aria-expanded={open} {...(open ? { "aria-controls": formId } : {})} aria-label="Zoeken" title="Zoeken" onClick={() => { if (open) sluit(); else { focusBijOpenen.current = true; setOpen(true); } }}><Icon name="search" /></button>{open && !!query.trim() && <button type="button" className="zoek-terug" onClick={() => invoer.current?.focus()}>Terug naar zoekveld</button>}</>;
  return (
    <div className="zoek-container">
      {typeof document === "undefined" ? knopEl : createPortal(knopEl, document.body)}
      {open && <ZoekFormulier alleenKoppen={alleenKoppen} onAlleenKoppen={onAlleenKoppen} id={formId} query={query} onChange={onChange} sluit={sluit} invoer={invoer} scope={scope} aantal={aantal} modus={modus} onModus={onModus} heleWoorden={heleWoorden} onHeleWoorden={onHeleWoorden} />}
      <span className="zoek-status" aria-live="polite">{query.trim() && !normaliseer(query) ? zoekAanwijzing : open && query.trim() && melding?.query === query && melding.aantal === aantal ? resultaatTekst(aantal) + (modus === "of" ? " · één van de zoektermen (OF)" : " · alle zoektermen") + (heleWoorden ? " · hele woorden" : "") + scopeMelding : ""}</span>
    </div>
  );
}

// Eigen component: de hooks staan los van het formulier. Alleen een klik/Enter op een knop verplaatst de focus, nooit tijdens typen.
function ResultaatNav({ query, aantal, reset }: { query: string; aantal: number; reset: string }) {
  // focusin op een kaart houdt de teller gelijk.
  const [huidig, setHuidig] = useState<number | null>(null);
  const [navMelding, setNavMelding] = useState("");
  useEffect(() => { setHuidig(null); setNavMelding(""); }, [reset, aantal]);
  useEffect(() => {
    if (typeof document === "undefined" || typeof document.addEventListener !== "function") return;
    const inFocus = (e: Event) => {
      const kaart = (e.target as HTMLElement | null)?.closest?.(`#${resultatenId} .nc`) as HTMLElement | null | undefined;
      const i = kaart ? Number(kaart.dataset.i) : NaN;
      if (Number.isInteger(i)) { setHuidig(i); setNavMelding(""); }
    };
    document.addEventListener("focusin", inFocus);
    return () => document.removeEventListener("focusin", inFocus);
  }, []);
  const spring = (richting: -1 | 1) => {
    const doel = (huidig ?? -1) + richting;
    if (doel < 0) { setNavMelding(navTekst(0, aantal, "eerste")); if (huidig === null) { setHuidig(0); naarResultaat(document, 0); } return; }
    if (doel >= aantal) { setNavMelding(navTekst(aantal - 1, aantal, "laatste")); return; }
    setHuidig(doel);
    setNavMelding(navTekst(doel, aantal));
    naarResultaat(document, doel);
  };
  if (aantal < 2 || !normaliseer(query)) return null;
  return <span className="zoek-nav" role="group" aria-label="Navigeren door zoekresultaten">
    <button type="button" className="zoek-wis-filters" aria-disabled={huidig === null || huidig <= 0} onClick={() => spring(-1)}>Vorig resultaat</button>
    <button type="button" className="zoek-wis-filters" aria-disabled={huidig !== null && huidig >= aantal - 1} onClick={() => spring(1)}>Volgend resultaat</button>
    <span className="zoek-scope" aria-live="polite">{navMelding}</span>
  </span>;
}

export function ZoekFormulier({ id, query, onChange, sluit, invoer, scope, aantal = 0, alleenKoppen = false, onAlleenKoppen, modus = "alle", onModus = () => {}, heleWoorden = false, onHeleWoorden }: { heleWoorden?: boolean; onHeleWoorden?: (waarde: boolean) => void; alleenKoppen?: boolean; onAlleenKoppen?: (waarde: boolean) => void; modus?: Zoekmodus; onModus?: (modus: Zoekmodus) => void; id?: string; query: string; onChange: (query: string) => void; sluit: () => void; invoer: React.RefObject<HTMLInputElement>; scope?: ZoekScope; aantal?: number }) {
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
        <label className="zoek-scope"><input type="checkbox" checked={heleWoorden} onChange={(e) => onHeleWoorden?.(e.target.checked)} /> Alleen hele woorden</label>
        {!!normaliseer(query) && <span className="zoek-scope">{resultaatTekst(aantal)} · {modus === "of" ? "één van de zoektermen (OF)" : "alle zoektermen"}{heleWoorden ? " · hele woorden" : ""}</span>}
        {aantal > 0 && !!normaliseer(query) && <a href={`#${resultatenId}`} className="zoek-wis-filters zoek-naar-resultaten" onClick={(e) => { e.preventDefault(); focusResultaten(document); }}>Ga naar resultaten ({aantal})</a>}
        <ResultaatNav query={query} aantal={aantal} reset={`${modus}|${alleenKoppen}|${heleWoorden}`} />
        <label className="zoek-scope">Zoeken in <select value={alleenKoppen ? "koppen" : "alles"} onChange={(e) => onAlleenKoppen?.(e.target.value === "koppen")}><option value="alles">Alle velden</option><option value="koppen">Alleen koppen</option></select></label>
        {scope?.bron && (scope.bron.opties.length > 0 || scope.bron.gekozen) && <label className="zoek-scope">Bron <select value={scope.bron.gekozen} onChange={(e) => scope.bron!.onKies(e.target.value)}><option value="">Alle bronnen</option>{scope.bron.opties.map((o) => <option key={o.sleutel} value={o.sleutel}>{o.label} ({o.aantal})</option>)}</select>{scope.bron.gekozen && <button type="button" className="zoek-wis-filters" onClick={() => scope.bron!.onKies("")}>Wis bronkeuze</button>}</label>}
        {scope?.bron?.gewist && <span className="zoek-scope" role="status">Bron {scope.bron.gewist} is uitgezet; er wordt nu in alle bronnen gezocht</span>}
        {!scope && <span id={hintId} className="zoek-scope">{uitsluitTip}</span>}
        {scope && <div id={scopeId} className="zoek-scope">
          <span>{scope.tekst}{scope.verborgen && query.trim() ? ` · ${verborgenTekst(scope.verborgen)}` : ""}</span>
          {scope.herstel && <button type="button" className="zoek-wis-filters" onClick={scope.herstel}>Terug naar eerdere selectie</button>}
          {scope.wisFilters && <button type="button" className="zoek-wis-filters" onClick={scope.wisFilters}>Wis filters</button>}
          <span>{uitsluitTip}</span>
        </div>}
      </form>;
}

// Filmpjesweergave heeft geen zoekbalk; zo blijft een actieve nieuwszoekopdracht zichtbaar en wisbaar (#1317).
export function ZoekActief({ query, onWis, klasse = "filternote" }: { query: string; onWis: () => void; klasse?: string }) {
  if (!normaliseer(query)) return null;
  return <div className={klasse} role="status"><span>Zoekopdracht “{query}” staat nog aan voor het nieuws; filmpjes worden niet gefilterd</span><button type="button" className="textbtn" onClick={onWis}>Wis zoekopdracht</button></div>;
}

export function ZoekLeeg({ query, bron, onWisBron, onWis, verborgen = 0, onWisFilters, onZoekAlles, suggesties = [], onSuggestie }: { query: string; bron?: string; onWisBron?: () => void; onWis: () => void; verborgen?: number; onWisFilters?: () => void; onZoekAlles?: () => void; suggesties?: string[]; onSuggestie?: (term: string) => void }) {
  const zoekbaar = !!normaliseer(query);
  return <div className="zoek-leeg">{zoekbaar ? <>Niets gevonden voor “{query}”{bron ? ` in bron ${bron}` : ""}</> : zoekAanwijzing}{zoekbaar && verborgen > 0 && <> · {verborgenTekst(verborgen)}</>}{suggesties.length > 0 && <div role="group" aria-label="Zoeksuggesties">Zoeksuggesties: {suggesties.map((term) => <button type="button" className="zoek-wis" key={term} onClick={() => onSuggestie?.(term)}>{term}</button>)}</div>} <button type="button" className="zoek-wis" onClick={onWis}>Wis zoekopdracht</button>{zoekbaar && bron && onWisBron && <button type="button" className="zoek-wis" onClick={onWisBron}>Wis bronkeuze en zoek opnieuw</button>}{zoekbaar && onZoekAlles && <button type="button" className="zoek-wis" onClick={onZoekAlles}>Zoek in alle rubrieken en beschikbare berichten</button>}{zoekbaar && verborgen > 0 && onWisFilters && <button type="button" className="zoek-wis" onClick={onWisFilters}>Wis filters en zoek opnieuw</button>}</div>;
}
