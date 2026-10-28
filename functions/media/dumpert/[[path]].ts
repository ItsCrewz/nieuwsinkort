// Cloudflare Pages Function: doorgeefluik voor Dumpert-video's (HLS).
// media.dumpert.nl staat alleen dumpert.nl toe (CORS), dus Chrome/Firefox (hls.js) halen
// de playlist en stukjes via /media/dumpert/... op ons eigen domein. Alleen GET/HEAD,
// alleen media.dumpert.nl, alleen video-bestanden.
interface Ctx {
  request: Request;
  params: { path?: string | string[] };
}

const ALLOWED = /^dmp\/media\/video\/[0-9a-f/-]+\/(?:\d+\/)?[\w.-]+\.(m3u8|ts|m4s|mp4|aac|key)$/i;

export const onRequest = async ({ request, params }: Ctx): Promise<Response> => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405 });
  }
  const p = Array.isArray(params.path) ? params.path.join("/") : params.path || "";
  if (!ALLOWED.test(p)) return new Response("Not found", { status: 404 });

  const upstream = `https://media.dumpert.nl/${p}`;
  const headers: Record<string, string> = { "User-Agent": "Mozilla/5.0 (nieuwsinkort.nl)" };
  const range = request.headers.get("Range");
  if (range) headers["Range"] = range;

  const r = await fetch(upstream, {
    method: request.method,
    headers,
    // @ts-ignore - Cloudflare-specifieke cache-optie
    cf: { cacheEverything: true, cacheTtl: p.endsWith(".m3u8") ? 600 : 86400 },
  });
  const out = new Headers();
  for (const h of ["content-type", "content-length", "content-range", "accept-ranges", "last-modified", "etag"]) {
    const v = r.headers.get(h);
    if (v) out.set(h, v);
  }
  out.set("Cache-Control", p.endsWith(".m3u8") ? "public, max-age=600" : "public, max-age=86400");
  out.set("Access-Control-Allow-Origin", "*");
  return new Response(r.body, { status: r.status, headers: out });
};
