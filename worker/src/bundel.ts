// AI bundelen (#453): nieuwe clusters wachten tot er een volle batch is of tot wachten tot de volgende run te lang zou duren.
// Bij uurlijks draaien (interval 60) is de tweede voorwaarde altijd waar, dus dan verandert er niets.
export const BATCH = 5; // clusters per AI-aanroep (zie `groups` in index.ts)
export const WACHT_MAX_MS = 10 * 60e3;
export const KORT_MIN_MS = 30 * 60e3;

/** "Eerst gezien" per cluster: nieuwe sleutels krijgen `nu`, sleutels die niet meer zonder samenvatting zijn vallen weg (blijft klein, alleen vandaag). */
export function bijwerkGezien(gezien: Record<string, number>, todoKeys: string[], nu: number): void {
  const nog = new Set(todoKeys);
  for (const k of Object.keys(gezien)) if (!nog.has(k)) delete gezien[k];
  for (const k of todoKeys) gezien[k] ||= nu;
}

/** Moet de AI deze run? `pickKeys` zijn de clusters die nu een samenvatting zouden krijgen. */
export function bundelBeslis(gezien: Record<string, number>, pickKeys: string[], nu: number, intervalMin: number, force: boolean): { wachtend: number; uitgesteld: boolean } {
  const wachtend = pickKeys.length;
  if (!wachtend || force || wachtend >= BATCH) return { wachtend, uitgesteld: false };
  const oudste = Math.min(...pickKeys.map((k) => gezien[k] ?? nu));
  return { wachtend, uitgesteld: nu + intervalMin * 60e3 - oudste <= WACHT_MAX_MS };
}

/** "In het kort" hooguit eens per 30 minuten (behalve force). */
export const kortToegestaan = (kortAt: number | undefined, nu: number, force: boolean): boolean => force || nu - (kortAt || 0) >= KORT_MIN_MS;
