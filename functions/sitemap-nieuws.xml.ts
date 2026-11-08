// News-sitemap met de berichtpagina's van de huidige dag (zelfde bron en URL's als /bericht/…); verlopen berichten vallen er vanzelf uit.
import { artikelPad, indexeerbaar } from "../src/artikelid";
import { dagdata } from "../src/dagdata";
import { ams } from "../src/tijd";
import { GELDIG_TOT, nogGeldig, overzichtBeleid } from "../src/overzichtcache";

interface Env { NIEUWS?: { get(key: string, opts: { type: "json" | "text"; cacheTtl?: number }): Promise<any> }; ASSETS: { fetch(req: Request | string): Promise<Response> } }
interface Ctx { request: Request; env: Env; waitUntil(p: Promise<unknown>): void }
type CacheMetDefault = CacheStorage & { default?: Cache };
const HDR = { "Content-Type": "application/xml; charset=utf-8", "X-Content-Type-Options": "nosniff", "Strict-Transport-Security": "max-age=86400" };
const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
const leeg = (items: string) => `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">${items}</urlset>\n`;
type Item = { id?: string; kop: string; ruw?: boolean; cat?: string; t?: number | string; bronnen?: { href: string }[] };
export function nieuwsSitemap(items: Item[], dag: string): string {
  const regels: string[] = [];
  for (const i of items) {
    if (regels.length >= 1000) break;
    const ms = i.t ? new Date(i.t).getTime() : NaN;
    if (!indexeerbaar(i) || !i.kop || !Number.isFinite(ms)) continue; // news:publication_date is verplicht; zonder geldige tijd overslaan
    // Geen <lastmod>: de dagdata kent per bericht alleen de publicatietijd `t`, geen werkelijke wijzigingstijd; die als lastmod opgeven is misleidend (#712).
    const datum = new Date(ms).toISOString();
    regels.push(`<url><loc>https://nieuwsinkort.nl${esc(artikelPad(i, dag))}</loc><news:news><news:publication><news:name>Nieuws in het kort</news:name><news:language>nl</news:language></news:publication><news:publication_date>${datum}</news:publication_date><news:title>${esc(i.kop)}</news:title></news:news></url>`);
  }
  return leeg(regels.join(""));
}
export async function onRequestGet(ctx: Ctx): Promise<Response> {
  const u = new URL(ctx.request.url);
  const cache = (globalThis.caches as CacheMetDefault | undefined)?.default;
  const sleutel = new Request(`${u.origin}${u.pathname}`);
  const bestaand = await cache?.match(sleutel).catch(() => undefined); // cachefout mag de sitemap niet breken
  const start = Date.now();
  if (bestaand && nogGeldig(bestaand, start)) return bestaand;
  const fout = () => new Response(leeg(""), { status: 503, headers: { ...HDR, "Cache-Control": "no-store", "Retry-After": "60" } });
  let xml: string, gegenereerd: string;
  try {
    const data = await dagdata({ request: new Request(`${u.origin}/data.json`), env: ctx.env }, false);
    if (!data.ok) return fout();
    const dag = await data.json() as { gegenereerd?: unknown; items?: Item[] } | null;
    if (typeof dag?.gegenereerd !== "string" || !Number.isFinite(Date.parse(dag.gegenereerd)) || !Array.isArray(dag.items)) return fout();
    gegenereerd = dag.gegenereerd;
    xml = nieuwsSitemap(dag.items, ams(Date.parse(gegenereerd)).iso);
  } catch { console.error("sitemap-nieuws: data lezen mislukt"); return fout(); }
  const beleid = overzichtBeleid(start, Date.now(), gegenereerd);
  if (!beleid) return new Response(xml, { headers: { ...HDR, "Cache-Control": "no-store" } });
  const response = new Response(xml, { headers: { ...HDR, "Cache-Control": beleid.cc, [GELDIG_TOT]: beleid.tot } });
  if (cache) ctx.waitUntil(cache.put(sleutel, response.clone()).catch(() => {}));
  return response;
}
