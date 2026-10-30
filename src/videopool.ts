// Vaste slots blijven gekoppeld aan index modulo drie; lege slots hebben geen bron.
export type PoolSlot = { slot: number; index: number | null; bron: boolean };

export function videopool(active: number, lengte: number, alleenActief = false): PoolSlot[] {
  const slots: PoolSlot[] = Array.from({ length: 3 }, (_, slot) => ({ slot, index: null, bron: false }));
  for (let index = active - 1; index <= active + 1; index++) {
    if (index < 0 || index >= lengte) continue;
    const slot = index % 3;
    slots[slot] = { slot, index, bron: index === active || (!alleenActief && index === active + 1) };
  }
  return slots;
}

export const POOL_GROOTTE = 3;
/** Vaste koppeling slide → slot: i-1, i en i+1 hebben altijd drie verschillende slots. */
export const slotVan = (index: number) => ((index % POOL_GROOTTE) + POOL_GROOTTE) % POOL_GROOTTE;

/** Slide-indexen die nu een bron (en dus een speler) mogen hebben. */
export function bronIndexen(active: number, lengte: number, alleenActief = false): Set<number> {
  return new Set(videopool(active, lengte, alleenActief).filter((s) => s.bron && s.index !== null).map((s) => s.index as number));
}

/** Native HLS alleen op Apple (Safari/iOS) of zonder MSE; Chrome gebruikt hls.js (MSE) via onze proxy. */
export function gebruiktNativeHls(canPlayHls: boolean, vendor: string, ua: string, mse: boolean): boolean {
  const apple = /Apple/.test(vendor) || /iP(hone|ad|od)/.test(ua);
  return canPlayHls && (apple || !mse);
}
