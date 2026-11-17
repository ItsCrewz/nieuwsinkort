// Kleine begrensde verzameling (#1091): bij overschrijding van `max` valt de langst ongebruikte sleutel weg.
// Uitgezette sleutels kunnen later gewoon opnieuw worden toegevoegd.
export class LruSet<T> {
  private s = new Set<T>();
  constructor(readonly max: number) {}
  get size() { return this.s.size; }
  has(k: T): boolean {
    if (!this.s.has(k)) return false;
    this.s.delete(k); // als recent gebruikt markeren
    this.s.add(k);
    return true;
  }
  add(k: T): this {
    this.s.delete(k);
    this.s.add(k);
    while (this.s.size > this.max) this.s.delete(this.s.values().next().value as T);
    return this;
  }
  delete(k: T): boolean { return this.s.delete(k); }
}
