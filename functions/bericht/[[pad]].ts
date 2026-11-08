import { artikelId, artikelPad, linkId, parsePad } from "../../src/artikelid";
import { berichtHtml } from "../../src/berichthtml";
import { dagdata, etag } from "../../src/dagdata";
import { etagMatch } from "../../src/etagmatch";
import { ams } from "../../src/tijd";

interface Env { NIEUWS?: { get(key: string, opts: { type: "json" | "text"; cacheTtl?: number }): Promise<any> }; ASSETS: { fetch(req: Request | string): Promise<Response> } }
interface Ctx { request: Request; env: Env; waitUntil(p: Promise<unknown>): void }
type CacheMetDefault = CacheStorage & { default?: Cache };
const basis = { "X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin", "X-Frame-Options": "DENY", "Strict-Transport-Security": "max-age=86400" };
const redirect = (status: number, locatie: string, cache: string) => new Response(null, { status, headers: { ...basis, Location: locatie, "Cache-Control": cache, ...(status === 302 ? { "X-Robots-Tag": "noindex" } : {}) } });
export async function onRequestGet(ctx: Ctx): Promise<Response> {
  const { request, env } = ctx;
  const u = new URL(request.url), pad = parsePad(u.pathname), nu = ams();
  const geldig = pad && /^\d{4}-\d{2}-\d{2}$/.test(pad.dag) && !Number.isNaN(Date.parse(`${pad.dag}T00:00:00Z`)) && new Date(`${pad.dag}T00:00:00Z`).toISOString().slice(0, 10) === pad.dag;
  if (!pad || !geldig || pad.dag > nu.iso) return new Response("Niet gevonden", { status: 404, headers: { ...basis, "Cache-Control": "no-store" } });
  const gisteren = new Date(Date.UTC(nu.y, nu.m - 1, nu.d - 1)).toISOString().slice(0, 10);
  if (pad.dag < gisteren || (pad.dag === gisteren && nu.h >= 6)) return redirect(301, `/${u.search}`, "public, max-age=86400");
  const cache = (globalThis.caches as CacheMetDefault | undefined)?.default;
  const sleutel = new Request(`${u.origin}${u.pathname}`);
  const bestaand = await cache?.match(sleutel).catch(() => undefined); // cachefout mag de pagina niet breken
  if (bestaand) {
    if (etagMatch(request.headers.get("If-None-Match"), bestaand.headers.get("ETag"))) return new Response(null, { status: 304, headers: bestaand.headers });
    return bestaand;
  }
  const tijdelijk = () => new Response("Data tijdelijk niet beschikbaar", { status: 503, headers: { ...basis, "Cache-Control": "no-store" } });
  let dag: { gegenereerd?: string; items?: { id?: string; kop: string; bronnen?: { site: string; href: string }[] }[] };
  try {
    const data = await dagdata({ request: new Request(`${u.origin}/data.json`), env }, false);
    if (!data.ok) return tijdelijk();
    dag = await data.json();
  } catch { return tijdelijk(); }
  if (!dag || typeof dag.gegenereerd !== "string" || !Number.isFinite(Date.parse(dag.gegenereerd)) || !Array.isArray(dag.items) || ams(Date.parse(dag.gegenereerd)).iso !== pad.dag) return tijdelijk();
  const items = dag.items;
  const item = items.find((i) => artikelId(i) === pad.id) || items.find((i) => i.bronnen?.some((b) => linkId(b.href) === pad.id));
  if (!item) return redirect(302, "/", "no-store");
  const canoniek = artikelPad(item, pad.dag);
  if (u.pathname !== canoniek) return redirect(301, `${canoniek}${u.search}`, "no-store");
  // De pagina is de app zelf (index.html met eigen kop-tags); lukt dat ophalen niet, dan opent de hash-route in de app.
  const sjabloon = await env.ASSETS.fetch(new Request(`${u.origin}/`)).catch(() => null);
  if (!sjabloon?.ok || !(sjabloon.headers.get("Content-Type") || "").includes("text/html")) return redirect(302, `/${u.search}#/bericht/${artikelId(item)}`, "no-store");
  const html = berichtHtml(await sjabloon.text(), item, pad.dag), tag = await etag(html);
  const headers = new Headers(sjabloon.headers);
  for (const [k, v] of Object.entries({ ...basis, "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300, stale-while-revalidate=600", ETag: tag })) headers.set(k, v);
  headers.delete("Content-Length"); headers.delete("Content-Encoding");
  const response = new Response(html, { headers });
  if (cache) ctx.waitUntil(cache.put(sleutel, response.clone()).catch(() => {}));
  if (etagMatch(request.headers.get("If-None-Match"), tag)) return new Response(null, { status: 304, headers });
  return response;
}
