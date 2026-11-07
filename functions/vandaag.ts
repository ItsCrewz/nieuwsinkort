// Lichte server-HTML met links naar alle berichtpagina's van vandaag: zonder JavaScript hebben crawlers anders geen interne links.
import { artikelPad, indexeerbaar } from "../src/artikelid";
import { dagdata } from "../src/dagdata";
import { ams } from "../src/tijd";
import { GELDIG_TOT, nogGeldig, overzichtBeleid } from "../src/overzichtcache";
import { ICOON_TAGS } from "../src/icoontags";

interface Env { NIEUWS?: { get(key: string, opts: { type: "json" | "text"; cacheTtl?: number }): Promise<any> }; ASSETS: { fetch(req: Request | string): Promise<Response> } }
interface Ctx { request: Request; env: Env; waitUntil(p: Promise<unknown>): void }
type CacheMetDefault = CacheStorage & { default?: Cache };
type Item = { id?: string; kop: string; ruw?: boolean; cat?: string; bronnen?: { href: string }[] };
const HDR = { "Content-Type": "text/html; charset=utf-8", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin", "X-Frame-Options": "DENY", "Strict-Transport-Security": "max-age=604800", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'" };
const RUBRIEKEN: [string, string][] = [["nl", "Nederland"], ["buitenland", "Buitenland"], ["haarlem", "Haarlem"], ["tech", "Tech"], ["sport", "Sport"], ["voetbal", "Voetbal"], ["f1", "Formule 1"], ["auto", "Auto"], ["showbizz", "Showbizz"]];
const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
export function vandaagHtml(items: Item[], dag: string): string {
  const lijst = items.filter((i) => i.kop && indexeerbaar(i));
  const delen = RUBRIEKEN.map(([cat, naam]) => {
    const rij = lijst.filter((i) => i.cat === cat).slice(0, 200);
    return rij.length ? `<h2>${naam}</h2><ul>${rij.map((i) => `<li><a href="${esc(artikelPad(i, dag))}">${esc(i.kop)}</a></li>`).join("")}</ul>` : "";
  }).join("");
  return `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Nieuws van vandaag – Nieuws in het kort</title><meta name="description" content="Alle nieuwsberichten van vandaag in het kort, per rubriek."><link rel="canonical" href="https://nieuwsinkort.nl/vandaag">${ICOON_TAGS}<style>body{font:1.1rem system-ui;max-width:45rem;margin:3rem auto;padding:0 1rem;line-height:1.6}a{color:#174aaa}</style></head><body><main><h1>Nieuws van vandaag</h1>${delen || "<p>Er zijn nog geen berichten voor vandaag.</p>"}<p><a href="/">Naar Nieuws in het kort</a></p></main></body></html>`;
}
export async function onRequestGet(ctx: Ctx): Promise<Response> {
  const u = new URL(ctx.request.url);
  const cache = (globalThis.caches as CacheMetDefault | undefined)?.default;
  const sleutel = new Request(`${u.origin}${u.pathname}`);
  const bestaand = await cache?.match(sleutel).catch(() => undefined); // cachefout mag de pagina niet breken
  const start = Date.now();
  if (bestaand && nogGeldig(bestaand, start)) return bestaand;
  const data = await dagdata({ request: new Request(`${u.origin}/data.json`), env: ctx.env }, false);
  if (!data.ok) return new Response("Data tijdelijk niet beschikbaar", { status: 503, headers: { ...HDR, "Cache-Control": "no-store", "Retry-After": "60" } });
  let html = vandaagHtml([], ""), gegenereerd: string | undefined;
  try {
    const dag = await data.json() as { gegenereerd?: string; items?: Item[] };
    if (dag.gegenereerd && Number.isFinite(Date.parse(dag.gegenereerd))) html = (gegenereerd = dag.gegenereerd,  vandaagHtml(Array.isArray(dag.items) ? dag.items : [], ams(Date.parse(dag.gegenereerd)).iso));
  } catch { console.error("vandaag: data lezen mislukt"); }
  const beleid = overzichtBeleid(start, Date.now(), gegenereerd, true); // swr alleen voor zover de grens het toelaat
  if (!beleid) return new Response(html, { headers: { ...HDR, "Cache-Control": "no-store" } });
  const response = new Response(html, { headers: { ...HDR, "Cache-Control": beleid.cc, [GELDIG_TOT]: beleid.tot } });
  if (cache) ctx.waitUntil(cache.put(sleutel, response.clone()).catch(() => {}));
  return response;
}
