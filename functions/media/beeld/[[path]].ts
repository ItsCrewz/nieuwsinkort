// Cloudflare Pages Function: doorgeefluik voor artikelbeelden van uitgevers (/media/beeld/<host>/<pad>?<query>).
// Rechtstreeks laden zet cookies van derden (bijv. __cf_bm van prod-img.telegraaf.nl) en kost Lighthouse-punten.
// Dit is een SSRF-grens: alleen GET/HEAD, alleen https en hosts uit src/beeldhost.ts, alleen afbeeldingstypes
// (geen svg), maximale grootte, geen cookies door in beide richtingen, redirects alleen binnen de allowlist.
// Formaatonderhandeling: uitgevers leveren per Accept avif/webp/jpeg. We delen de Accept van de bezoeker in emmers in en
// sturen die upstream, zodat de bezoeker dezelfde bytes krijgt als rechtstreeks (en geen avif zonder avif-ondersteuning).
// Cachen: de Cloudflare-randcache van de upstream-fetch staat uit (cache: "no-store" + cf.cacheTtl -1; die keyt op URL
// zonder Accept en cf.cacheKey werkt alleen op Enterprise). In plaats daarvan Cache API (caches.default, geen KV) met een
// eigen sleutel waarin de emmer zit, alleen voor geslaagde 200-antwoorden.
import { beeldHostToegestaan, beeldPadToegestaan, beeldPrefixToegestaan } from "../../../src/beeldhost";

interface Ctx {
  request: Request;
  waitUntil?: (p: Promise<unknown>) => void;
}
const PREFIX = "/media/beeld/";

const HDR = { "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox" };
const TYPE = /^image\/(jpeg|png|webp|gif|avif)(\s*;.*)?$/i;
const MAX = 5 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const TTL = 86400;
const UA = "nieuwsinkort/1.0 (+https://nieuwsinkort.pages.dev)";
const ACCEPT = { avif: "image/avif,image/webp,image/*;q=0.8", webp: "image/webp,image/*;q=0.8", basis: "image/png,image/jpeg,image/gif,image/*;q=0.8" } as const;
export type Emmer = keyof typeof ACCEPT;
const fout = (status: number, cache = "no-store") => new Response(status === 405 ? "Method not allowed" : "Not found", { status, headers: { ...HDR, "Cache-Control": cache, ...(status === 405 ? { Allow: "GET, HEAD" } : {}) } });
const weg = (r: Response) => { try { r.body?.cancel().catch(() => {}); } catch { /* al gelezen of vergrendeld */ } };

/** Accept van de bezoeker → emmer: avif als image/avif erin staat, anders webp, anders basis. */
export const acceptEmmer = (accept: string | null): Emmer => (/image\/avif/i.test(accept || "") ? "avif" : /image\/webp/i.test(accept || "") ? "webp" : "basis");
/** Synthetische Cache API-sleutel; de emmer zit erin, dus nooit vermenging tussen formaten. */
export const cacheSleutel = (emmer: Emmer, u: URL): string => `https://nieuwsinkort.nl/__beeldcache/${emmer}/${u.host}${u.pathname}${u.search}`;

// Upstream-URL uit het pad; null bij alles wat niet strikt een schone https-URL op de allowlist is.
export function upstreamUrl(path: string, search: string): URL | null {
  const i = path.indexOf("/");
  if (i < 1 || i === path.length - 1) return null;
  const host = path.slice(0, i);
  if (!beeldHostToegestaan(host) || !beeldPadToegestaan(host, path.slice(i), search)) return null;
  let u: URL;
  try { u = new URL(`https://${host}${path.slice(i)}${search}`); } catch { return null; }
  if (u.protocol !== "https:" || u.hostname !== host || u.port || u.username || u.password || !beeldHostToegestaan(u.hostname)) return null;
  return u;
}

export const onRequest = async ({ request, waitUntil }: Ctx): Promise<Response> => {
  if (request.method !== "GET" && request.method !== "HEAD") return fout(405);
  // Ruwe pad en query uit de request-URL (params zijn al gedecodeerd, dan zijn %2f-trucs niet te zien).
  let p = "", search = "";
  try { const u = new URL(request.url); search = u.search; p = u.pathname.startsWith(PREFIX) ? u.pathname.slice(PREFIX.length) : ""; } catch { /* onbruikbaar */ }
  let doel = upstreamUrl(p, search);
  if (!doel) return fout(404, "public, max-age=60");

  const emmer = acceptEmmer(request.headers.get("accept"));
  const sleutel = new Request(cacheSleutel(emmer, doel));
  const cache: Cache | undefined = (globalThis as { caches?: { default?: Cache } }).caches?.default;
  // Naar de bezoeker `private`: de gedeelde zone-randcache keyt op URL en negeert Vary, dus de eerste bezoeker bepaalde het formaat voor iedereen.
  // In de Cache API (emmer in de sleutel) blijft `public` staan, want die laag slaat `private` niet op.
  const metVary = (h: Headers) => { h.set("Vary", "Accept"); h.set("Cache-Control", `private, max-age=${TTL}`); return h; };
  if (cache) {
    let hit: Response | undefined;
    try { hit = await cache.match(sleutel); } catch { /* cachefout: gewoon upstream */ }
    if (hit && request.method === "HEAD") hit.body?.cancel().catch(() => {});
    if (hit) return new Response(request.method === "HEAD" ? null : hit.body, { status: 200, headers: metVary(new Headers(hit.headers)) });
  }

  let r: Response | null = null;
  for (let n = 0; n <= MAX_REDIRECTS; n++) {
    try {
      r = await fetch(doel.toString(), {
        method: request.method,
        headers: { "User-Agent": UA, Accept: ACCEPT[emmer] }, // bewust zonder Cookie/Authorization/Referer van de bezoeker
        redirect: "manual",
        cache: "no-store", // geen randcache op URL-basis: die kent geen Accept en zou emmers mengen
        // @ts-ignore - Cloudflare-specifieke opties; cacheTtl -1 = ook cf-kant geen opslag (cacheKey werkt alleen op Enterprise)
        cf: { cacheTtl: -1, cacheEverything: false },
      });
    } catch {
      return fout(502);
    }
    if (r.status < 300 || r.status >= 400) break;
    // Redirect: elke stap opnieuw door dezelfde controle (host op de allowlist, https), anders weigeren.
    const loc = r.headers.get("location");
    weg(r);
    let volgende: URL | null = null;
    try { if (loc) volgende = new URL(loc, doel); } catch { /* ongeldig */ }
    if (!volgende || volgende.protocol !== "https:" || volgende.port || volgende.username || volgende.password || !beeldHostToegestaan(volgende.hostname) || !beeldPrefixToegestaan(volgende.hostname, volgende.pathname) || n === MAX_REDIRECTS) return fout(502);
    doel = volgende;
    r = null;
  }
  if (!r) return fout(502);
  if (!r.ok) { weg(r); return fout(r.status === 404 ? 404 : 502, r.status === 404 ? "public, max-age=30" : "no-store"); }

  const type = r.headers.get("content-type") || "";
  if (!TYPE.test(type)) { weg(r); return fout(415); }
  const lengte = r.headers.get("content-length");
  if (lengte !== null && !(/^\d+$/.test(lengte) && Number(lengte) <= MAX)) { weg(r); return fout(413); }

  const out = new Headers(HDR);
  out.set("Content-Type", type.split(";")[0].trim().toLowerCase());
  // De runtime pakt een gecodeerde body uit: dan klopt de upstream-lengte niet meer met wat wij sturen.
  for (const h of r.headers.get("content-encoding") ? ["last-modified", "etag"] : ["content-length", "last-modified", "etag"]) {
    const v = r.headers.get(h);
    if (v) out.set(h, v);
  }
  out.set("Cache-Control", `public, max-age=${TTL}`);
  if (request.method === "HEAD" || !r.body) { weg(r); return new Response(null, { status: 200, headers: metVary(out) }); }

  // Zonder (of met een liegende) content-length: tellen en afbreken zodra de grens overschreden wordt.
  let tel = 0;
  const begrens = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, ctl) {
      tel += chunk.byteLength;
      if (tel > MAX) ctl.error(new Error("te groot"));
      else ctl.enqueue(chunk);
    },
  });
  const body = r.body.pipeThrough(begrens);
  if (!cache) return new Response(body, { status: 200, headers: metVary(out) });
  // Alleen dit geslaagde antwoord in de Cache API (24 u); een afgebroken (te grote) stream wordt niet opgeslagen.
  const [naarBezoeker, naarCache] = body.tee();
  const opslaan = cache.put(sleutel, new Response(naarCache, { status: 200, headers: out })).catch(() => {});
  if (waitUntil) waitUntil(opslaan); else await opslaan;
  return new Response(naarBezoeker, { status: 200, headers: metVary(new Headers(out)) });
};
