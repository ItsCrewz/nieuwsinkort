// /meer?k=<sleutel>: de extra tekst achter "Lees verder" voor één bericht (uur-Worker zet alles in KV "meer").
// { uitleg?: string[], perBron?: {site,href,punten[]}[], uittreksel?: {site,href,alineas[]}[] } of 404.
interface KV { get(key: string, opts: { type: "json"; cacheTtl?: number }): Promise<any> }
interface Ctx { request: Request; env: { NIEUWS?: KV } }
const HDR = { "X-Content-Type-Options": "nosniff", "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" };

// De blob "meer" is honderden KB; KV geeft hem als JSON en elke parse kost CPU (Pages-limiet, #409).
// Per isolate en per KV-binding 60 s hergebruiken, zoals de cacheTtl van KV zelf al toestond.
const TTL = 60e3;
const cache = new WeakMap<object, { at: number; M: any }>();
async function leesMeer(kv: KV): Promise<any> {
  const c = cache.get(kv);
  if (c && Date.now() - c.at < TTL) return c.M;
  const M = await kv.get("meer", { type: "json", cacheTtl: 60 });
  if (M) cache.set(kv, { at: Date.now(), M }); // ontbrekende blob niet bewaren: lezen kost dan geen parse
  return M;
}

export const onRequestGet = async ({ request, env }: Ctx): Promise<Response> => {
  const k = new URL(request.url).searchParams.get("k") || "";
  if (!k || k.length > 600 || !env.NIEUWS) return new Response('{"fout":"geen sleutel"}', { status: 400, headers: HDR });
  let M: any = null;
  try { M = await leesMeer(env.NIEUWS); } catch { console.error("meer: fout bij fallback"); /* KV even niet bereikbaar */ }
  const m = M?.items?.[k];
  if (!m) return new Response('{"fout":"niet gevonden"}', { status: 404, headers: { ...HDR, "Cache-Control": "no-store" } });
  return new Response(JSON.stringify(m), { headers: { ...HDR, "Cache-Control": "public, max-age=600" } });
};
