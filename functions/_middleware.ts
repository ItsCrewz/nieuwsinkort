// Middleware voor alle Pages Functions-routes: www.nieuwsinkort.nl en het productie-pages.dev-adres → 301 naar nieuwsinkort.nl (pad + query behouden);
// previews (*.nieuwsinkort.pages.dev) blijven bruikbaar maar krijgen X-Robots-Tag: noindex (geen duplicaat in de index).
// Via code omdat de Cloudflare-login geen Redirect Rules op de zone mag schrijven; www is custom domain van het Pages-project.
interface Ctx { request: Request; next: () => Promise<Response> }
const WWW = "www.nieuwsinkort.nl";
const APEX = "nieuwsinkort.nl";
const PAGES = "nieuwsinkort.pages.dev";

// Pure keuze: doeladres bij www of productie-pages.dev, anders null (apex, previews en andere hosts blijven ongemoeid).
export const wwwDoel = (rawUrl: string): string | null => {
  let u: URL;
  try { u = new URL(rawUrl); } catch { return null; }
  const h = u.hostname.toLowerCase();
  if (h !== WWW && h !== PAGES) return null;
  return `https://${APEX}${u.pathname}${u.search}`;
};

// Pure keuze: preview-host (subdomein van pages.dev-project) → noindex.
export const isPreview = (rawUrl: string): boolean => {
  try { return new URL(rawUrl).hostname.toLowerCase().endsWith("." + PAGES); } catch { return false; }
};

export const onRequest = async ({ request, next }: Ctx): Promise<Response> => {
  const doel = wwwDoel(request.url);
  if (!doel) {
    const r = await next();
    if (!isPreview(request.url)) return r;
    // nieuwe Response: headers van doorgegeven (asset)responses kunnen onveranderlijk zijn
    const h = new Headers(r.headers);
    h.set("X-Robots-Tag", "noindex");
    return new Response(r.body, { status: r.status, statusText: r.statusText, headers: h });
  }
  return new Response(null, { status: 301, headers: { Location: doel, "X-Content-Type-Options": "nosniff" } });
};
