// Middleware voor alle Pages Functions-routes: www.nieuwsinkort.nl → 301 naar nieuwsinkort.nl (pad + query behouden).
// Via code omdat de Cloudflare-login geen Redirect Rules op de zone mag schrijven; www is custom domain van het Pages-project.
interface Ctx { request: Request; next: () => Promise<Response> }
const WWW = "www.nieuwsinkort.nl";
const APEX = "nieuwsinkort.nl";

// Pure keuze: doeladres bij www, anders null (apex, *.pages.dev en andere hosts blijven ongemoeid).
export const wwwDoel = (rawUrl: string): string | null => {
  let u: URL;
  try { u = new URL(rawUrl); } catch { return null; }
  if (u.hostname.toLowerCase() !== WWW) return null;
  return `https://${APEX}${u.pathname}${u.search}`;
};

export const onRequest = async ({ request, next }: Ctx): Promise<Response> => {
  const doel = wwwDoel(request.url);
  if (!doel) return next();
  return new Response(null, { status: 301, headers: { Location: doel, "X-Content-Type-Options": "nosniff" } });
};
