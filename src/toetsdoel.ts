// Mag een feed-sneltoets (pijltjes, Home/End, j/k…) de feed bedienen? Niet als focus op eigen bediening buiten de feed staat.
type Doel = { closest(s: string): unknown } | null;

/** true bij body, null of iets binnen de feed; false bij link, knop, summary of tab buiten de feed. */
export function feedToetsDoel(t: Doel, feed: { contains(n: any): boolean } | null): boolean {
  if (!t) return true;
  if (feed && feed.contains(t)) return true;
  return !t.closest("a,button,summary,[role=button],[role=tab],[role=link],[role=menuitem]");
}
