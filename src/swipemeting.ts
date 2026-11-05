// Tijden zijn relatief aan performance.timeOrigin en blijven onderling vergelijkbaar.
export type SwipeMeting = { slide: number; gesture: number; actief?: number; play?: number; playing?: number; frame?: number; poster?: number };
export function swipeDoel(startY: number, y: number, actief: number): number | null {
  const verschil = y - startY;
  return Math.abs(verschil) > 30 ? actief + (verschil < 0 ? 1 : -1) : null;
}
export function bewaarMeting(lijst: SwipeMeting[], meting: SwipeMeting): void {
  lijst.push(meting);
  if (lijst.length > 10) lijst.splice(0, lijst.length - 10);
}

export function herstelSwipe(van: number, naar: number, actief: number): boolean {
  return van !== naar && actief === van;
}
