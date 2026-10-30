export function isDumpertBron(src: string): boolean {
  try { return new URL(src).hostname === "media.dumpert.nl"; } catch { return false; }
}

export function dumpertRoute({ src, nativeHls, fout, msSindsStart, heeftFrame, alGewisseld }: {
  src: string; nativeHls: boolean; fout: boolean; msSindsStart: number; heeftFrame: boolean; alGewisseld: boolean;
}): "direct" | "proxy" {
  if (!isDumpertBron(src)) return "direct";
  return !nativeHls || alGewisseld || fout || (msSindsStart >= 4000 && !heeftFrame) ? "proxy" : "direct";
}
