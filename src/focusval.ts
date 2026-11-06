// Focusval voor modale vensters: Tab en Shift+Tab blijven binnen de bediening van het venster en lopen rond.
const BEDIENING = "a[href], button, input, select, textarea, [tabindex]";

/** Zichtbare, ingeschakelde bediening in tabvolgorde (tabindex -1 en uitgeschakeld vallen af). */
export function bediening(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(BEDIENING)).filter(
    (el) => !(el as HTMLButtonElement).disabled && el.tabIndex >= 0 && el.getClientRects().length > 0 && el.getAttribute("aria-hidden") !== "true"
  );
}

/** Element dat de focus moet krijgen, of null als de browser zelf het volgende element mag kiezen. */
export function volgendeFocus(lijst: HTMLElement[], actief: Element | null, shift: boolean): HTMLElement | null {
  if (!lijst.length) return null;
  const i = actief ? lijst.indexOf(actief as HTMLElement) : -1;
  if (i < 0) return shift ? lijst[lijst.length - 1] : lijst[0]; // focus buiten het venster: terughalen
  if (shift && i === 0) return lijst[lijst.length - 1];
  if (!shift && i === lijst.length - 1) return lijst[0];
  return null;
}
