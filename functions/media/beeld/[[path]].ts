// Cloudflare Pages Function: doorgeefluik voor artikelbeelden van uitgevers (/media/beeld/<host>/<pad>?<query>).
// Rechtstreeks laden zet cookies van derden (bijv. __cf_bm van prod-img.telegraaf.nl) en kost Lighthouse-punten.
// Dit is een SSRF-grens: alleen GET/HEAD, alleen https en hosts uit src/beeldhost.ts, alleen afbeeldingstypes
// (geen svg), maximale grootte, geen cookies door in beide richtingen, redirects alleen binnen de allowlist.
import { beeldHostToegestaan } from "../../../src/beeldhost";

interface Ctx {
  request: Request;
}
const PREFIX = "/media/beeld/";

const HDR = { "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox" };
const TYPE = /^image\/(jpeg|png|webp|gif|avif)(\s*;.*)?$/i;
const MAX = 5 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const UA = "nieuwsinkort/1.0 (+https://nieuwsinkort.pages.dev)";
const fout = (status: number, cache = "no-store") => new Response(status === 405 ? "Method not allowed" : "Not found", { status, headers: { ...HDR, "Cache-Control": cache, ...(status === 405 ? { Allow: "GET, HEAD" } : {}) } });

const stuurTeken = (s: string): boolean => [...s].some((c) => c.charCodeAt(0) < 0x20 || c.charCodeAt(0) === 0x7f);

// Upstream-URL uit het pad; null bij alles wat niet strikt een schone https-URL op de allowlist is.
export function upstreamUrl(path: string, search: string): URL | null {
  // Percent-codes (spaties in bestandsnamen) blijven staan zoals ze zijn, maar geen versluierde slash/punt/backslash/control/%25.
  if (!path || stuurTeken(path) || /\\|%(?:2[5ef]|5c|0[0-9a-f]|1[0-9a-f]|7f)/i.test(path) || path.includes("//") || path.split("/").some((s) => s === "." || s === "..")) return null;
  const i = path.indexOf("/");
  if (i < 1 || i === path.length - 1) return null;
  const host = path.slice(0, i);
  if (!beeldHostToegestaan(host)) return null;
  if (stuurTeken(search) || search.includes("\\")) return null;
  let u: URL;
  try { u = new URL(`https://${host}${path.slice(i)}${search}`); } catch { return null; }
  if (u.protocol !== "https:" || u.hostname !== host || u.port || u.username || u.password || !beeldHostToegestaan(u.hostname)) return null;
  return u;
}

export const onRequest = async ({ request }: Ctx): Promise<Response> => {
  if (request.method !== "GET" && request.method !== "HEAD") return fout(405);
  // Ruwe pad en query uit de request-URL (params zijn al gedecodeerd, dan zijn %2f-trucs niet te zien).
  let p = "", search = "";
  try { const u = new URL(request.url); search = u.search; p = u.pathname.startsWith(PREFIX) ? u.pathname.slice(PREFIX.length) : ""; } catch { /* onbruikbaar */ }
  let doel = upstreamUrl(p, search);
  if (!doel) return fout(404, "public, max-age=60");

  let r: Response | null = null;
  for (let n = 0; n <= MAX_REDIRECTS; n++) {
    try {
      r = await fetch(doel.toString(), {
        method: request.method,
        headers: { "User-Agent": UA, Accept: "image/avif,image/webp,image/*" }, // bewust zonder Cookie/Authorization/Referer van de bezoeker
        redirect: "manual",
        // @ts-ignore - Cloudflare-specifieke cache-optie
        cf: { cacheEverything: true, cacheTtlByStatus: { "200-299": 86400, "404": 30, "500-599": 0 } },
      });
    } catch {
      return fout(502);
    }
    if (r.status < 300 || r.status >= 400) break;
    // Redirect: elke stap opnieuw door dezelfde controle (host op de allowlist, https), anders weigeren.
    const loc = r.headers.get("location");
    let volgende: URL | null = null;
    try { if (loc) volgende = new URL(loc, doel); } catch { /* ongeldig */ }
    if (!volgende || volgende.protocol !== "https:" || volgende.port || volgende.username || volgende.password || !beeldHostToegestaan(volgende.hostname) || n === MAX_REDIRECTS) return fout(502);
    doel = volgende;
    r = null;
  }
  if (!r) return fout(502);
  if (!r.ok) return fout(r.status === 404 ? 404 : 502, r.status === 404 ? "public, max-age=30" : "no-store");

  const type = r.headers.get("content-type") || "";
  if (!TYPE.test(type)) return fout(415);
  const lengte = r.headers.get("content-length");
  if (lengte !== null && !(/^\d+$/.test(lengte) && Number(lengte) <= MAX)) return fout(413);

  const out = new Headers(HDR);
  out.set("Content-Type", type.split(";")[0].trim().toLowerCase());
  for (const h of ["content-length", "last-modified", "etag"]) {
    const v = r.headers.get(h);
    if (v) out.set(h, v);
  }
  out.set("Cache-Control", "public, max-age=86400");
  if (request.method === "HEAD" || !r.body) return new Response(null, { status: 200, headers: out });

  // Zonder (of met een liegende) content-length: tellen en afbreken zodra de grens overschreden wordt.
  let tel = 0;
  const begrens = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, ctl) {
      tel += chunk.byteLength;
      if (tel > MAX) ctl.error(new Error("te groot"));
      else ctl.enqueue(chunk);
    },
  });
  return new Response(r.body.pipeThrough(begrens), { status: 200, headers: out });
};
