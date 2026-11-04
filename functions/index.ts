// Startpagina "/": index.html met in <noscript> de dagsamenvatting en de eerste 10 koppen met bronlink (progressive enhancement, #313).
// Met JavaScript wordt <noscript> niet gerenderd: React start zoals voorheen, geen layoutverschuiving of hydration. Elke fout valt terug op de kale asset.
import { dagdata } from "../src/dagdata";
import { veiligeUrl } from "../src/url";

interface Env { NIEUWS?: { get(key: string, type: "json" | "text"): Promise<any> }; ASSETS: { fetch(req: Request | string): Promise<Response> } }
interface Ctx { request: Request; env: Env; waitUntil(p: Promise<unknown>): void; next?: () => Promise<Response> }
type CacheMetDefault = CacheStorage & { default?: Cache };
type Item = { kop?: string; bronnen?: { site?: string; href?: string }[] };
const MAX_KOPPEN = 10;
const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** Inhoud van <noscript>: dezelfde dag_samenvatting en koppen als data.json, ook als er geen data is (dan alleen de link naar /vandaag). */
export function noscriptHtml(dag: { dag_samenvatting?: string; items?: Item[] } | null): string {
  const koppen = (Array.isArray(dag?.items) ? dag!.items! : []).filter((i) => typeof i?.kop === "string" && i.kop.trim()).slice(0, MAX_KOPPEN);
  const samenvatting = typeof dag?.dag_samenvatting === "string" && dag.dag_samenvatting.trim() ? `<h2>In het kort</h2><p>${esc(dag.dag_samenvatting.trim())}</p>` : "";
  const lijst = koppen.map((i) => {
    const b = i.bronnen?.[0], href = veiligeUrl(b?.href);
    return `<li>${href ? `<a href="${esc(href)}">${esc(i.kop)}</a>` : esc(i.kop)}${b?.site ? ` (${esc(b.site)})` : ""}</li>`;
  }).join("");
  return `<main><h1>Nieuws in het kort</h1><p>Zet JavaScript aan voor de volledige site.</p>${samenvatting}${lijst ? `<h2>Koppen</h2><ul>${lijst}</ul>` : ""}<p><a href="/vandaag">Het nieuws van vandaag per rubriek</a></p></main>`;
}

/** Vervangt de inhoud van de eerste <noscript> (functie als vervanger: geen $-patronen uit de data). */
export const metNoscript = (html: string, binnen: string): string => html.replace(/<noscript>[\s\S]*?<\/noscript>/, () => `<noscript>${binnen}</noscript>`);

export async function onRequestGet(ctx: Ctx): Promise<Response> {
  const u = new URL(ctx.request.url);
  const asset = await ctx.env.ASSETS.fetch(new Request(`${u.origin}/`, { headers: ctx.request.headers }));
  const type = asset.headers.get("Content-Type") || "";
  if (!asset.ok || !type.includes("text/html")) return asset;
  let binnen = noscriptHtml(null);
  try {
    const cache = (globalThis.caches as CacheMetDefault | undefined)?.default;
    const sleutel = new Request(`${u.origin}/__noscript`);
    const bestaand = await cache?.match(sleutel).catch(() => undefined); // cachefout mag de pagina niet breken
    if (bestaand) binnen = await bestaand.text();
    else {
      const data = await dagdata({ request: new Request(`${u.origin}/data.json`), env: ctx.env }, false);
      if (data.ok) {
        binnen = noscriptHtml(await data.json() as { dag_samenvatting?: string; items?: Item[] });
        if (cache) ctx.waitUntil(cache.put(sleutel, new Response(binnen, { headers: { "Cache-Control": "public, max-age=300" } })).catch(() => {}));
      }
    }
  } catch { console.error("index: noscript vullen mislukt"); }
  const headers = new Headers(asset.headers);
  for (const h of ["ETag", "Content-Length", "Last-Modified", "Content-Encoding"]) headers.delete(h); // body wijkt af van de asset
  headers.set("Cache-Control", "public, max-age=0, must-revalidate");
  return new Response(metNoscript(await asset.text(), binnen), { status: asset.status, headers });
}
