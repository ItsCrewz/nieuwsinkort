// YouTube-feedstoring (#480): de kanaalfeeds (youtube.com/feeds/videos.xml) geven soms uren lang 404/500, ook voor alle kanalen tegelijk.
// Eén kanarie-feed vooraf beslist per run of de rest nog zin heeft; zo gaan er tijdens een storing 1 i.p.v. alle verzoeken uit en geen harde bronfouten.
// Pure logica (geen Cloudflare-imports), getest in tests/yt-storing.test.ts.

export const YT_STORING_TEKST = "YouTube-feedstoring (tijdelijk)";
export const isYtFeed = (url: string) => /youtube\.com\/feeds\//.test(url);

interface JobLike { url: string; kind: string }
interface ResLike { url: string; ok: boolean; status: number }
export interface YtStoring { status: number; overgeslagen: number }

/** Storing = 404 of 5xx; status 0 (netwerkfout/time-out) is één trage kanarie en geen storing, net als 403/429 een gewone fout. */
export const ytStoringStatus = (r: ResLike) => !r.ok && (r.status === 404 || r.status >= 500);

/**
 * Haalt de eerste YouTube-feed (kanarie) apart op. Pas als die een storing geeft, volgt een tweede kanarie (de volgende YouTube-feed), zodat één dood kanaal niet alles uitschakelt.
 * Geven beide een storing, dan komen de andere YouTube-feeds van deze run in `overslaan` (geen verzoek); anders blijven ze in `rest`.
 * Opgehaalde kanaries zitten in `canary` en worden niet nog eens opgehaald. Bij één YouTube-job beslist die alleen.
 */
export async function ytCanary<J extends JobLike, R extends ResLike>(due: J[], haal: (js: J[]) => Promise<R[]>): Promise<{ canary: R[]; rest: J[]; overslaan: J[]; storing: YtStoring | null }> {
  const yt = due.filter((j) => j.kind === "feed" && isYtFeed(j.url));
  if (!yt.length) return { canary: [], rest: [], overslaan: [], storing: null };
  const proef = async (k: J) => {
    let canary: R[];
    try { canary = await haal([k]); } catch { canary = [{ url: k.url, ok: false, status: 0 } as R]; }
    const r = canary.find((x) => x.url === k.url) ?? ({ url: k.url, ok: false, status: 0 } as R);
    return { canary: canary.length ? canary : [r], r };
  };
  const p1 = await proef(yt[0]);
  if (!ytStoringStatus(p1.r)) return { canary: p1.canary, rest: yt.slice(1), overslaan: [], storing: null };
  if (yt.length < 2) return { canary: p1.canary, rest: [], overslaan: [], storing: { status: p1.r.status, overgeslagen: 0 } };
  const p2 = await proef(yt[1]), canary = [...p1.canary, ...p2.canary], anderen = yt.slice(2);
  if (ytStoringStatus(p2.r)) return { canary, rest: [], overslaan: anderen, storing: { status: p1.r.status, overgeslagen: anderen.length } };
  return { canary, rest: anderen, overslaan: [], storing: null };
}

/** Telt voor een bron mee wat echt onbereikbaar is: YouTube-feeds uit een storing vallen erbuiten. */
export function onbereikbaar<R extends { url: string; ok: boolean }>(rs: R[], ytStoring: ReadonlySet<string>): { totaal: number; fout: number; storing: boolean; alleenYt: boolean } {
  const gewoon = rs.filter((r) => !ytStoring.has(r.url));
  return { totaal: gewoon.length, fout: gewoon.filter((r) => !r.ok).length, storing: gewoon.length < rs.length, alleenYt: rs.length > 0 && !gewoon.length };
}
