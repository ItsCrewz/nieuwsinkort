// Feed-sneltoetsen (pijltjes, Home/End, j/k) mogen bediening buiten de feed niet kapen.
// Bewust geen [tabindex]: een neutraal doel (<main tabindex="0">, skip-doel) is geen bediening.
export const BEDIENING = "button,a[href],summary,[role=button],[role=link],[role=tab],[role=menuitem],[role=checkbox],[role=switch],[role=slider],[role=radio],[role=option],[role=combobox]";

export function buitenFeedBediening(t: { closest(s: string): unknown } | null): boolean {
  return !!t && !t.closest(".nf") && !!t.closest(BEDIENING);
}
