// YouTube-feedstoring (#480): de kanaalfeeds (youtube.com/feeds/videos.xml) geven soms uren lang 404/500, ook voor alle kanalen tegelijk.
// Eén kanarie-feed vooraf beslist per run of de rest nog zin heeft; zo gaan er tijdens een storing 1 i.p.v. alle verzoeken uit en geen harde bronfouten.
// Pure logica (geen Cloudflare-imports), getest in tests/yt-storing.test.ts.

export const YT_STORING_TEKST = "YouTube-feedstoring (tijdelijk)";
export const isYtFeed = (url: string) => /youtube\.com\/feeds\//.test(url);

interface JobLike { url: string; kind: string }
interface ResLike { url: string; ok: boolean; status: number }
export interface YtStoring { status: number; overgeslagen: number }

/** Storing = 404, 5xx of geen antwoord (netwerkfout/time-out, status 0); 403/429 blijft een gewone fout. */
export const ytStoringStatus = (r: ResLike) => !r.ok && (r.status === 0 || r.status === 404 || r.status >= 500);

/**
 * Haalt de eerste YouTube-feed (kanarie) apart op. Antwoordt die met een storing, dan komen de andere YouTube-feeds van deze run in `overslaan` (geen verzoek);
 * anders blijven ze in `rest` en wordt de kanarie niet nog eens opgehaald (zijn antwoord zit in `canary`).
 */
export async function ytCanary<J extends JobLike, R extends ResLike>(due: J[], haal: (js: J[]) => Promise<R[]>): Promise<{ canary: R[]; rest: J[]; overslaan: J[]; storing: YtStoring | null }> {
  const yt = due.filter((j) => j.kind === "feed" && isYtFeed(j.url));
  if (!yt.length) return { canary: [], rest: [], overslaan: [], storing: null };
  const kanarie = yt[0], anderen = yt.slice(1);
  let canary: R[];
  try { canary = await haal([kanarie]); } catch { canary = [{ url: kanarie.url, ok: false, status: 0 } as R]; }
  const r = canary.find((x) => x.url === kanarie.url) ?? ({ url: kanarie.url, ok: false, status: 0 } as R);
  if (ytStoringStatus(r)) return { canary: canary.length ? canary : [r], rest: [], overslaan: anderen, storing: { status: r.status, overgeslagen: anderen.length } };
  return { canary, rest: anderen, overslaan: [], storing: null };
}

/** Telt voor een bron mee wat echt onbereikbaar is: YouTube-feeds uit een storing vallen erbuiten. */
export function onbereikbaar<R extends { url: string; ok: boolean }>(rs: R[], ytStoring: ReadonlySet<string>): { totaal: number; fout: number; storing: boolean; alleenYt: boolean } {
  const gewoon = rs.filter((r) => !ytStoring.has(r.url));
  return { totaal: gewoon.length, fout: gewoon.filter((r) => !r.ok).length, storing: gewoon.length < rs.length, alleenYt: rs.length > 0 && !gewoon.length };
}
