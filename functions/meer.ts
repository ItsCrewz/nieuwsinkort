// /meer?k=<sleutel>: de extra tekst achter "Lees verder" voor één bericht (uur-Worker zet alles in KV "meer").
// { uitleg?: string[], perBron?: {site,href,punten[]}[], uittreksel?: {site,href,alineas[]}[] } of 404.
interface KV { get(key: string, opts: { type: "json"; cacheTtl?: number }): Promise<any> }
interface Ctx { request: Request; env: { NIEUWS?: KV } }
const HDR = { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" };

export const onRequestGet = async ({ request, env }: Ctx): Promise<Response> => {
  const k = new URL(request.url).searchParams.get("k") || "";
  if (!k || k.length > 600 || !env.NIEUWS) return new Response('{"fout":"geen sleutel"}', { status: 400, headers: HDR });
  let M: any = null;
  try { M = await env.NIEUWS.get("meer", { type: "json", cacheTtl: 60 }); } catch { /* KV even niet bereikbaar */ }
  const m = M?.items?.[k];
  if (!m) return new Response('{"fout":"niet gevonden"}', { status: 404, headers: { ...HDR, "Cache-Control": "no-store" } });
  return new Response(JSON.stringify(m), { headers: { ...HDR, "Cache-Control": "public, max-age=600" } });
};
