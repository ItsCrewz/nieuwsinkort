import { dagdata } from "../src/dagdata";
import { homeNoscript } from "../src/homehtml";
import { ams } from "../src/tijd";

interface Env { NIEUWS?: { get(key: string, opts: { type: "json" | "text"; cacheTtl?: number }): Promise<any> }; ASSETS: { fetch(req: Request | string): Promise<Response> } }
interface Ctx { request: Request; env: Env; waitUntil(p: Promise<unknown>): void }
type CacheMetDefault = CacheStorage & { default?: Cache };

export async function onRequestGet(ctx: Ctx): Promise<Response> {
  const u = new URL(ctx.request.url), cache = (globalThis.caches as CacheMetDefault | undefined)?.default;
  const sleutel = new Request(`${u.origin}/`);
  const bestaand = await cache?.match(sleutel).catch(() => undefined);
  if (bestaand) return bestaand;
  const sjabloon = await ctx.env.ASSETS.fetch(new Request(`${u.origin}/`));
  if (!sjabloon.ok) return sjabloon;
  let blok = homeNoscript(), geldig = false;
  try {
    const antwoord = await dagdata({ request: new Request(`${u.origin}/data.json`), env: ctx.env }, false);
    if (antwoord.ok) {
      const data = await antwoord.json() as { gegenereerd?: string };
      const tijd = Date.parse(data.gegenereerd || ""), nu = ams();
      const gisteren = new Date(Date.UTC(nu.y, nu.m - 1, nu.d - 1)).toISOString().slice(0, 10);
      geldig = Number.isFinite(tijd) && (ams(tijd).iso === nu.iso || (nu.h < 6 && ams(tijd).iso === gisteren));
      if (geldig) blok = homeNoscript(data);
    }
  } catch { console.error("home: dagdata lezen mislukt"); }
  const html = (await sjabloon.text()).replace(/<noscript>[\s\S]*?<\/noscript>/, () => `<noscript>${blok}</noscript>`);
  const headers = new Headers(sjabloon.headers);
  headers.set("Cache-Control", geldig ? "public, max-age=300, stale-while-revalidate=600" : "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.delete("Content-Length"); headers.delete("Content-Encoding"); headers.delete("ETag");
  const response = new Response(html, { headers });
  if (geldig && cache) ctx.waitUntil(cache.put(sleutel, response.clone()).catch(() => {}));
  return response;
}
