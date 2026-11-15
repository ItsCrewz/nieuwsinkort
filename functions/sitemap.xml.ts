// Sitemap met de vaste pagina's en alle indexeerbare berichtpagina's van vandaag (zelfde URL's als /bericht/…); verlopen berichten vallen er vanzelf uit.
import { artikelId, artikelPad, heeftArtikelId, indexeerbaar } from "../src/artikelid";
import { dagdata } from "../src/dagdata";
import { ams } from "../src/tijd";
import { GELDIG_TOT, nogGeldig, overzichtBeleid, cacheHit, datasetVerlopen } from "../src/overzichtcache";

interface Env { NIEUWS?: { get(key: string, opts: { type: "json" | "text"; cacheTtl?: number }): Promise<any> }; ASSETS: { fetch(req: Request | string): Promise<Response> } }
interface Ctx { request: Request; env: Env; waitUntil(p: Promise<unknown>): void }
type CacheMetDefault = CacheStorage & { default?: Cache };
const HDR = { "Content-Type": "application/xml; charset=utf-8", "X-Content-Type-Options": "nosniff", "Strict-Transport-Security": "max-age=86400" };
const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
const OVER_LASTMOD = "2026-11-04"; // /over is statisch: bij een inhoudelijke wijziging deze datum bijwerken
type Item = { id?: string; kop: string; ruw?: boolean; cat?: string; t?: number | string; bronnen?: { href: string }[] };
const url = (pad: string, lastmod?: string) => `<url><loc>https://nieuwsinkort.nl${esc(pad)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}</url>`;
export function sitemap(items: Item[], dag: string, gegenereerd: string): string {
  const regels = [url("/", gegenereerd), url("/vandaag", gegenereerd), url("/over", OVER_LASTMOD)];
  const tel = new Map<string, number>();
  for (const i of items) tel.set(artikelId(i), (tel.get(artikelId(i)) || 0) + 1);
  for (const i of items) {
    if (!heeftArtikelId(i) || tel.get(artikelId(i)) !== 1) continue; // niet-unieke id: /bericht/… stuurt door naar /
    if (regels.length >= 1000) break;
    if (!indexeerbaar(i) || !i.kop) continue;
    const ms = i.t ? new Date(i.t).getTime() : NaN;
    regels.push(url(artikelPad(i, dag), Number.isFinite(ms) ? new Date(ms).toISOString() : undefined));
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${regels.join("")}</urlset>\n`;
}
export async function onRequestGet(ctx: Ctx): Promise<Response> {
  const u = new URL(ctx.request.url);
  const cache = (globalThis.caches as CacheMetDefault | undefined)?.default;
  const sleutel = new Request(`${u.origin}${u.pathname}`);
  const bestaand = await cache?.match(sleutel).catch(() => undefined); // cachefout mag de sitemap niet breken
  const start = Date.now();
  if (bestaand && nogGeldig(bestaand, start)) return cacheHit(bestaand, start);
  const data = await dagdata({ request: new Request(`${u.origin}/data.json`), env: ctx.env }, false);
  const vast = (d: string) => sitemap([], d, d);
  let xml = vast(ams().iso), gegenereerd: string | undefined;
  if (!data.ok) return new Response(xml, { headers: { ...HDR, "Cache-Control": "public, max-age=60" } }); // vaste pagina's blijven vindbaar
  try {
    const dag = await data.json() as { gegenereerd?: string; items?: Item[] };
    if (dag.gegenereerd && Number.isFinite(Date.parse(dag.gegenereerd))) { gegenereerd = dag.gegenereerd; xml = sitemap(!datasetVerlopen(gegenereerd, Date.now()) && Array.isArray(dag.items) ? dag.items : [], ams(Date.parse(dag.gegenereerd)).iso, new Date(dag.gegenereerd).toISOString()); }
  } catch { console.error("sitemap: data lezen mislukt"); }
  const beleid = gegenereerd ? overzichtBeleid(start, Date.now(), gegenereerd) : null;
  if (!beleid) return new Response(xml, { headers: { ...HDR, "Cache-Control": "no-store" } });
  const response = new Response(xml, { headers: { ...HDR, "Cache-Control": beleid.cc, [GELDIG_TOT]: beleid.tot } });
  if (cache) ctx.waitUntil(cache.put(sleutel, response.clone()).catch(() => {}));
  return response;
}
