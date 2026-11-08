// Exacte woordenset voorkomt dat een vage overeenkomst een ander verhaal hergebruikt.
const STOP = new Set("aan als bij dat deze door een en het maar met naar nog om ook over uit van voor wordt zijn heeft hebben wil gaat niet meer na tegen tussen voor bij dit die".split(" "));

export function clusterHash(titel: string, rubriek: string): string {
  const woorden = [...new Set((titel.normalize("NFKC").toLowerCase().match(/[\p{L}\p{N}]+/gu) || []).filter((w) => w.length >= 4 && !STOP.has(w)))].sort();
  return woorden.length >= 2 ? JSON.stringify([rubriek, woorden]) : "";
}

export function vindClusterSum<T extends { at: number }>(hashes: Record<string, string>, sums: Record<string, T>, titel: string, rubriek: string, nu: number): T | null {
  const hash = clusterHash(titel, rubriek), sum = hash && sums[hashes[hash]];
  return sum && nu >= sum.at && nu - sum.at < 24 * 3600e3 ? sum : null;
}
