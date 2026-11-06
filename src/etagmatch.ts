// If-None-Match (RFC 9110 §13.1.2): lijst van tags of `*`, zwakke vergelijking (W/ telt niet mee).
const kaal = (t: string) => t.trim().replace(/^W\//, "");
export function etagMatch(kop: string | null, tag: string | null): boolean {
  if (!kop || !tag) return false;
  const lijst = kop.match(/(?:W\/)?"[^"]*"|\*/g);
  if (!lijst) return false;
  const doel = kaal(tag);
  return lijst.some((t) => t === "*" || kaal(t) === doel);
}
