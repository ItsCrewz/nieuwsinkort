// Toetsbediening van de videovoortgang (slider): pijlen ±5 s, Home/End naar begin/einde.
type Doel = { closest(s: string): unknown } | null;

/** Nieuwe positie in seconden (binnen 0..duur) of null bij een onbekende toets of ongeldige duur. */
export function scrubDoel(key: string, cur: number, dur: number): number | null {
  if (!(dur > 0) || !isFinite(dur)) return null;
  const van = isFinite(cur) ? cur : 0;
  let t: number;
  if (key === "ArrowRight" || key === "ArrowUp") t = van + 5;
  else if (key === "ArrowLeft" || key === "ArrowDown") t = van - 5;
  else if (key === "Home") t = 0;
  else if (key === "End") t = dur;
  else return null;
  return Math.min(dur, Math.max(0, t));
}

/** true als het toetsdoel een slider is of erbinnen valt: de globale feedtoetsen laten die met rust. */
export function isSliderDoel(t: Doel): boolean {
  return !!t && !!t.closest("[role=slider]");
}
