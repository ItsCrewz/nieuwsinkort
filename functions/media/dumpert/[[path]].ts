// Cloudflare Pages Function: doorgeefluik voor Dumpert-video's (HLS).
// media.dumpert.nl staat alleen dumpert.nl toe (CORS), dus Chrome/Firefox (hls.js) halen
// de playlist en stukjes via /media/dumpert/... op ons eigen domein. Alleen GET/HEAD,
// alleen media.dumpert.nl, alleen video-bestanden.
interface Ctx {
  request: Request;
  params: { path?: string | string[] };
}

const HDR = { "X-Content-Type-Options": "nosniff" };
// Harde grens op het wachten op de upstream-headers: een hangende media.dumpert.nl mag de speler niet eindeloos laten draaien.
const UPSTREAM_MS = 8000;
const ALLOWED = /^dmp\/media\/video\/[0-9a-f/-]+\/(?:\d+\/)?[\w.-]+\.(m3u8|ts|m4s|mp4|aac|key)$/i;

export const onRequest = async ({ request, params }: Ctx): Promise<Response> => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405, headers: HDR });
  }
  const p = Array.isArray(params.path) ? params.path.join("/") : params.path || "";
  if (!ALLOWED.test(p)) return new Response("Not found", { status: 404, headers: HDR });

  const upstream = `https://media.dumpert.nl/${p}`;
  const isList = p.endsWith(".m3u8");
  const headers: Record<string, string> = { "User-Agent": "Mozilla/5.0 (nieuwsinkort.nl)" };
  const range = request.headers.get("Range");
  if (range) headers["Range"] = range;

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), UPSTREAM_MS);
  let r: Response;
  try {
    r = await fetch(upstream, {
    signal: ac.signal,
    method: request.method,
    headers,
    // @ts-ignore - Cloudflare-specifieke cache-optie
    // Playlists kort (5 min), stukjes video veranderen nooit: een jaar aan de rand van Cloudflare.
    cf: { cacheEverything: true, cacheTtlByStatus: { "200-299": isList ? 300 : 31536000, "404": 30, "500-599": 0 } },
    });
  } catch {
    // Time-out of netwerkfout: 504 zonder cache, zodat hls.js snel faalt en de feed een poster/foutmelding toont.
    return new Response("Upstream time-out", { status: 504, headers: { ...HDR, "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" } });
  } finally {
    clearTimeout(timer);
  }
  const out = new Headers(HDR);
  for (const h of ["content-type", "content-length", "content-range", "accept-ranges", "last-modified", "etag"]) {
    const v = r.headers.get(h);
    if (v) out.set(h, v);
  }
  if (r.ok) out.set("Cache-Control", isList ? "public, max-age=300, stale-while-revalidate=600" : "public, max-age=31536000, immutable");
  else out.set("Cache-Control", "no-store");
  out.set("Access-Control-Allow-Origin", "*");
  return new Response(r.body, { status: r.status, headers: out });
};
