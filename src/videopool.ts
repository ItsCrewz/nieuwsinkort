// Vaste slots blijven gekoppeld aan index modulo drie; lege slots hebben geen bron.
export type PoolSlot = { slot: number; index: number | null; bron: boolean };

export function videopool(active: number, lengte: number): PoolSlot[] {
  const slots: PoolSlot[] = Array.from({ length: 3 }, (_, slot) => ({ slot, index: null, bron: false }));
  for (let index = active - 1; index <= active + 1; index++) {
    if (index < 0 || index >= lengte) continue;
    const slot = index % 3;
    slots[slot] = { slot, index, bron: index === active || index === active + 1 };
  }
  return slots;
}

export const POOL_GROOTTE = 3;
/** Vaste koppeling slide → slot: i-1, i en i+1 hebben altijd drie verschillende slots. */
export const slotVan = (index: number) => ((index % POOL_GROOTTE) + POOL_GROOTTE) % POOL_GROOTTE;

/** Slide-indexen die nu een bron (en dus een speler) mogen hebben. */
export function bronIndexen(active: number, lengte: number): Set<number> {
  return new Set(videopool(active, lengte).filter((s) => s.bron && s.index !== null).map((s) => s.index as number));
}

/** Minimale <video>-interface voor bronwissels, testbaar zonder DOM. */
export type PoolVideo = { pause(): void; load(): void; removeAttribute(naam: string): void };

/** Synchroon bronvrij maken in vaste volgorde: pauzeren, hls.js weg, src weg, load(). Pas daarna verplaatsen. */
export function maakBronvrij(el: PoolVideo, hls?: { destroy(): void } | null) {
  try { el.pause(); } catch { /* negeer */ }
  hls?.destroy();
  el.removeAttribute("src");
  el.load();
}

// Per slot een bron-generatie en één opruimfunctie: een oude eigenaar (late cleanup, async import, timer)
// raakt een inmiddels opnieuw toegewezen slot nooit meer aan.
export class PoolEigenaars {
  private gen: number[] = Array(POOL_GROOTTE).fill(0);
  private opruim: ((() => void) | null)[] = Array(POOL_GROOTTE).fill(null);
  /** Nieuwe eigenaar: een achtergebleven bron wordt eerst synchroon opgeruimd. */
  claim(slot: number): number {
    this.ruimOp(slot);
    return ++this.gen[slot];
  }
  actueel(slot: number, gen: number) { return this.gen[slot] === gen; }
  generatie(slot: number) { return this.gen[slot]; }
  /** Opruimfunctie van de huidige bron; false (en niets gezet) als het slot inmiddels van een ander is. */
  zetOpruim(slot: number, gen: number, fn: () => void): boolean {
    if (!this.actueel(slot, gen)) return false;
    this.ruimOp(slot);
    this.opruim[slot] = fn;
    return true;
  }
  /** Ruimt de bron op (hooguit één keer); met `gen` alleen als die nog de eigenaar is. */
  ruimOp(slot: number, gen?: number): boolean {
    if (gen !== undefined && !this.actueel(slot, gen)) return false;
    const fn = this.opruim[slot];
    this.opruim[slot] = null;
    fn?.();
    return true;
  }
  /** Eigenaar weg: eerst bron opruimen, dan pas parkeren. Een oude eigenaar doet niets. */
  geefVrij(slot: number, gen: number, parkeer: () => void): boolean {
    if (!this.ruimOp(slot, gen)) return false;
    parkeer();
    return true;
  }
}

/** Native HLS alleen op Apple (Safari/iOS) of zonder MSE; Chrome gebruikt hls.js (MSE) via onze proxy. */
export function gebruiktNativeHls(canPlayHls: boolean, vendor: string, ua: string, mse: boolean): boolean {
  const apple = /Apple/.test(vendor) || /iP(hone|ad|od)/.test(ua);
  return canPlayHls && (apple || !mse);
}
