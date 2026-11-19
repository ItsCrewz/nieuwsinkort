// Tijden zijn relatief aan performance.timeOrigin en blijven onderling vergelijkbaar.
export type SwipeMeting = { slide: number; gesture: number; actief?: number; play?: number; playing?: number; frame?: number; poster?: number };
// Alleen een eenduidig verticale veeg (> 30 px en minstens 1,5x zo veel hoogte als breedte) kiest een buurspeler.
export function swipeDoel(startX: number, startY: number, x: number, y: number, actief: number): number | null {
  const verschil = y - startY;
  if (Math.abs(verschil) <= 30 || Math.abs(verschil) < 1.5 * Math.abs(x - startX)) return null;
  return actief + (verschil < 0 ? 1 : -1);
}
export function bewaarMeting(lijst: SwipeMeting[], meting: SwipeMeting): void {
  lijst.push(meting);
  if (lijst.length > 10) lijst.splice(0, lijst.length - 10);
}

export function herstelSwipe(van: number, naar: number, actief: number): boolean {
  return van !== naar && actief === van;
}
