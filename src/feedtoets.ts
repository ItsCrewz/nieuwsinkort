// Feed-sneltoetsen (pijltjes, Home/End, j/k) mogen bediening buiten de feed niet kapen.
const BEDIENING = "button,a[href],summary,[role=button],[role=tab],[role=menuitem],[role=link],[tabindex]:not([tabindex='-1'])";

export function buitenFeedBediening(t: { closest(s: string): unknown } | null): boolean {
  return !!t && !t.closest(".nf") && !!t.closest(BEDIENING);
}
