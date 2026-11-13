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
  timeoutMs?: number; // alleen voor tests
}
const PREFIX = "/media/beeld/";

const HDR = { "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox" };
const TYPE = /^image\/(jpeg|png|webp|gif|avif)(\s*;.*)?$/i;
const MAX = 5 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const TTL = 86400;
const TIJDSLIMIET = 8000; // totale wachttijd upstream (redirects + body)
const UA = "nieuwsinkort/1.0 (+https://nieuwsinkort.pages.dev)";
// Geen image/*-joker: die zou ook een uitgesloten formaat (avif bij q=0) toestaan.
const ACCEPT = { avif: "image/avif,image/webp,image/jpeg,image/png,image/gif", webp: "image/webp,image/jpeg,image/png,image/gif", basis: "image/png,image/jpeg,image/gif" } as const;
export type Emmer = keyof typeof ACCEPT;
const fout = (status: number, cache = "no-store") => new Response(status === 405 ? "Method not allowed" : "Not found", { status, headers: { ...HDR, "Cache-Control": cache, ...(status === 405 ? { Allow: "GET, HEAD" } : {}) } });
const weg = (r: Response) => { try { r.body?.cancel().catch(() => {}); } catch { /* al gelezen of vergrendeld */ } };

/** Accept van de bezoeker → emmer: avif als image/avif erin staat, anders webp, anders basis. */
// Een formaat telt alleen als het genoemd is met q > 0 (q=0 = uitdrukkelijk uitgesloten).
const accepteert = (accept: string, type: string): boolean =>
  accept.toLowerCase().split(",").some((deel) => {
    const [naam, ...params] = deel.split(";").map((s) => s.trim());
    if (naam !== type) return false;
    const q = params.map((p) => /^q\s*=\s*([\d.]+)$/.exec(p)).find(Boolean);
    return !q || Number(q[1]) > 0;
  });
// Uitdrukkelijk uitgesloten (q=0) formaat van deze bezoeker; geldt ook voor wat een uitgever of oude cache-entry teruggeeft.
export const uitgesloten = (accept: string | null, type: string): boolean =>
  (accept || "").toLowerCase().split(",").some((deel) => {
    const [naam, ...params] = deel.split(";").map((x) => x.trim());
    return naam === type.split(";")[0].trim().toLowerCase() && params.some((x) => /^q\s*=\s*0*(\.0*)?$/.test(x));
  });
export const acceptEmmer = (accept: string | null): Emmer => (accepteert(accept || "", "image/avif") ? "avif" : accepteert(accept || "", "image/webp") ? "webp" : "basis");
// Upstream-Accept van de emmer zonder formaten die de bezoeker uitsloot (q=0); anders levert de uitgever een formaat dat we daarna afwijzen.
export const upstreamAccept = (emmer: Emmer, accept: string | null): string => ACCEPT[emmer].split(",").filter((t) => !uitgesloten(accept, t)).join(",");
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

export const onRequest = async ({ request, waitUntil, timeoutMs }: Ctx): Promise<Response> => {
  if (request.method !== "GET" && request.method !== "HEAD") return fout(405);
  // Ruwe pad en query uit de request-URL (params zijn al gedecodeerd, dan zijn %2f-trucs niet te zien).
  let p = "", search = "";
  try { const u = new URL(request.url); search = u.search; p = u.pathname.startsWith(PREFIX) ? u.pathname.slice(PREFIX.length) : ""; } catch { /* onbruikbaar */ }
  let doel = upstreamUrl(p, search);
  if (!doel) return fout(404, "public, max-age=60");

  const accept = request.headers.get("accept");
  const emmer = acceptEmmer(accept);
  const sleutel = new Request(cacheSleutel(emmer, doel));
  const cache: Cache | undefined = (globalThis as { caches?: { default?: Cache } }).caches?.default;
  // Naar de bezoeker `private`: de gedeelde zone-randcache keyt op URL en negeert Vary, dus de eerste bezoeker bepaalde het formaat voor iedereen.
  // In de Cache API (emmer in de sleutel) blijft `public` staan, want die laag slaat `private` niet op.
  const metVary = (h: Headers) => { h.set("Vary", "Accept"); h.set("Cache-Control", `private, max-age=${TTL}`); return h; };
  if (cache) {
    let hit: Response | undefined;
    try { hit = await cache.match(sleutel); } catch { /* cachefout: gewoon upstream */ }
    if (hit && uitgesloten(accept, hit.headers.get("content-type") || "")) { weg(hit); hit = undefined; }
    if (hit && request.method === "HEAD") hit.body?.cancel().catch(() => {});
    if (hit) return new Response(request.method === "HEAD" ? null : hit.body, { status: 200, headers: metVary(new Headers(hit.headers)) });
  }

  // Eén deadline voor redirects en body samen; bij overschrijding wordt elk upstream-verzoek afgebroken.
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs ?? TIJDSLIMIET);
  const klaar = () => clearTimeout(timer);
  let r: Response | null = null;
  for (let n = 0; n <= MAX_REDIRECTS; n++) {
    try {
      r = await fetch(doel.toString(), {
        method: request.method,
        headers: { "User-Agent": UA, Accept: upstreamAccept(emmer, accept) }, // bewust zonder Cookie/Authorization/Referer van de bezoeker
        redirect: "manual",
        signal: ac.signal,
        cache: "no-store", // geen randcache op URL-basis: die kent geen Accept en zou emmers mengen
        // @ts-ignore - Cloudflare-specifieke opties; cacheTtl -1 = ook cf-kant geen opslag (cacheKey werkt alleen op Enterprise)
        cf: { cacheTtl: -1, cacheEverything: false },
      });
    } catch {
      klaar();
      return ac.signal.aborted ? fout(504) : fout(502);
    }
    if (r.status < 300 || r.status >= 400) break;
    // Redirect: elke stap opnieuw door dezelfde controle (host op de allowlist, https), anders weigeren.
    const loc = r.headers.get("location");
    weg(r);
    let volgende: URL | null = null;
    try { if (loc) volgende = new URL(loc, doel); } catch { /* ongeldig */ }
    if (!volgende || volgende.protocol !== "https:" || volgende.port || volgende.username || volgende.password || !beeldHostToegestaan(volgende.hostname) || !beeldPrefixToegestaan(volgende.hostname, volgende.pathname, volgende.search) || n === MAX_REDIRECTS) { klaar(); return fout(502); }
    doel = volgende;
    r = null;
  }
  if (!r) { klaar(); return fout(502); }
  if (!r.ok) { klaar(); weg(r); return fout(r.status === 404 ? 404 : 502, r.status === 404 ? "public, max-age=30" : "no-store"); }

  const type = r.headers.get("content-type") || "";
  if (!TYPE.test(type) || uitgesloten(accept, type)) { klaar(); weg(r); return fout(415); }
  const lengte = r.headers.get("content-length");
  if (lengte !== null && !(/^\d+$/.test(lengte) && Number(lengte) <= MAX)) { klaar(); weg(r); return fout(413); }

  const out = new Headers(HDR);
  out.set("Content-Type", type.split(";")[0].trim().toLowerCase());
  // De runtime pakt een gecodeerde body uit: dan klopt de upstream-lengte niet meer met wat wij sturen.
  for (const h of r.headers.get("content-encoding") ? ["last-modified", "etag"] : ["content-length", "last-modified", "etag"]) {
    const v = r.headers.get(h);
    if (v) out.set(h, v);
  }
  out.set("Cache-Control", `public, max-age=${TTL}`);
  if (request.method === "HEAD" || !r.body) { klaar(); weg(r); return new Response(null, { status: 200, headers: metVary(out) }); }

  // Zonder (of met een liegende) content-length: tellen en afbreken zodra de grens overschreden wordt.
  let tel = 0;
  const begrens = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, ctl) {
      tel += chunk.byteLength;
      if (tel > MAX) ctl.error(new Error("te groot"));
      else ctl.enqueue(chunk);
    },
    flush: klaar,
  });
  const body = r.body.pipeThrough(begrens);
  if (!cache) return new Response(body, { status: 200, headers: metVary(out) });
  // Alleen dit geslaagde antwoord in de Cache API (24 u); een afgebroken (te grote) stream wordt niet opgeslagen.
  const [naarBezoeker, naarCache] = body.tee();
  const opslaan = cache.put(sleutel, new Response(naarCache, { status: 200, headers: out })).catch(() => {});
  if (waitUntil) waitUntil(opslaan); else await opslaan;
  return new Response(naarBezoeker, { status: 200, headers: metVary(new Headers(out)) });
};
