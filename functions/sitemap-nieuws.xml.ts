// News-sitemap met de berichtpagina's van de huidige dag (zelfde bron en URL's als /bericht/…); verlopen berichten vallen er vanzelf uit.
import { artikelPad, heeftArtikelId, indexeerbaar } from "../src/artikelid";
import { dagdata } from "../src/dagdata";
import { ams } from "../src/tijd";
import { GELDIG_TOT, nogGeldig, overzichtBeleid, cacheHit, datasetVerlopen } from "../src/overzichtcache";

interface Env { NIEUWS?: { get(key: string, opts: { type: "json" | "text"; cacheTtl?: number }): Promise<any> }; ASSETS: { fetch(req: Request | string): Promise<Response> } }
interface Ctx { request: Request; env: Env; waitUntil(p: Promise<unknown>): void }
type CacheMetDefault = CacheStorage & { default?: Cache };
const HDR = { "Content-Type": "application/xml; charset=utf-8", "X-Content-Type-Options": "nosniff", "Strict-Transport-Security": "max-age=604800" };
// XML 1.0 staat alleen deze codepunten toe.
// eslint-disable-next-line no-control-regex
const esc = (s: unknown) => String(s ?? "").replace(/[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
const leeg = (items: string) => `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">${items}</urlset>\n`;
// Nieuws-sitemap: alleen berichten van de afgelopen 48 uur (Google News); absolute tijd, dus onafhankelijk van zomer-/wintertijd (#1301).
const MAX_LEEFTIJD = 48 * 3600e3;
type Item = { id?: string; kop: string; ruw?: boolean; cat?: string; t?: number | string; bronnen?: { href: string }[] };
function nieuwsRegels(items: Item[], dag: string, nu: number): string[] {
  const regels: string[] = [];
  const urls = new Set<string>();
  for (const i of items) {
    const ms = i.t ? new Date(i.t).getTime() : NaN;
    if (!heeftArtikelId(i) || !indexeerbaar(i) || !i.kop || !Number.isFinite(ms)) continue; // news:publication_date is verplicht; zonder geldige tijd overslaan
    if (ms > nu) continue; // foutieve brontijd: nog niet gepubliceerd, geen toekomstige publication_date aanbieden (#1175)
    if (ms < nu - MAX_LEEFTIJD) continue; // te oud: geen oude publicatie als actueel nieuws aanbieden (#1301)
    // Geen <lastmod>: de dagdata kent per bericht alleen de publicatietijd `t`, geen werkelijke wijzigingstijd; die als lastmod opgeven is misleidend (#712).
    const datum = new Date(ms).toISOString();
    const url = artikelPad(i, dag);
    if (urls.has(url)) continue;
    urls.add(url);
    regels.push(`<url><loc>https://nieuwsinkort.nl${esc(url)}</loc><news:news><news:publication><news:name>Nieuws in het kort</news:name><news:language>nl</news:language></news:publication><news:publication_date>${datum}</news:publication_date><news:title>${esc(i.kop)}</news:title></news:news></url>`);
  }
  return regels;
}
const PER_DEEL = 1000;
export function nieuwsSitemap(items: Item[], dag: string, nu: number = Date.now(), deel?: number): string {
  const regels = nieuwsRegels(items, dag, nu);
  if (deel !== undefined) return leeg(regels.slice((deel - 1) * PER_DEEL, deel * PER_DEEL).join(""));
  if (regels.length <= PER_DEEL) return leeg(regels.join(""));
  const delen = Math.ceil(regels.length / PER_DEEL);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${Array.from({ length: delen }, (_, i) => `<sitemap><loc>https://nieuwsinkort.nl/sitemap-nieuws.xml?deel=${i + 1}</loc></sitemap>`).join("")}</sitemapindex>\n`;
}
export async function onRequestGet(ctx: Ctx): Promise<Response> {
  const u = new URL(ctx.request.url);
  const deelTekst = u.searchParams.get("deel");
  if (deelTekst !== null && (!/^[1-9]\d*$/.test(deelTekst) || !Number.isSafeInteger(Number(deelTekst)))) return new Response("", { status: 404, headers: { "Cache-Control": "no-store" } });
  const deel = deelTekst === null ? undefined : Number(deelTekst);
  const cache = (globalThis.caches as CacheMetDefault | undefined)?.default;
  const sleutel = new Request(`${u.origin}${u.pathname}${deel === undefined ? "" : `?deel=${deel}`}`);
  const bestaand = await cache?.match(sleutel).catch(() => undefined); // cachefout mag de sitemap niet breken
  const start = Date.now();
  if (bestaand && nogGeldig(bestaand, start)) return cacheHit(bestaand, start);
  const fout = () => new Response(leeg(""), { status: 503, headers: { ...HDR, "Cache-Control": "no-store", "Retry-After": "60" } });
  let xml: string, gegenereerd: string;
  try {
    const data = await dagdata({ request: new Request(`${u.origin}/data.json`), env: ctx.env }, false);
    if (!data.ok) return fout();
    const dag = await data.json() as { gegenereerd?: unknown; items?: Item[] } | null;
    if (typeof dag?.gegenereerd !== "string" || !Number.isFinite(Date.parse(dag.gegenereerd)) || !Array.isArray(dag.items)) return fout();
    gegenereerd = dag.gegenereerd;
    xml = nieuwsSitemap(datasetVerlopen(gegenereerd, Date.now()) ? [] : dag.items, ams(Date.parse(gegenereerd)).iso, Date.now(), deel);
  } catch { console.error("sitemap-nieuws: data lezen mislukt"); return fout(); }
  const beleid = overzichtBeleid(start, Date.now(), gegenereerd);
  if (!beleid) return new Response(xml, { headers: { ...HDR, "Cache-Control": "no-store" } });
  const response = new Response(xml, { headers: { ...HDR, "Cache-Control": beleid.cc, [GELDIG_TOT]: beleid.tot } });
  if (cache) ctx.waitUntil(cache.put(sleutel, response.clone()).catch(() => {}));
  return response;
}
