// Middleware voor alle Pages Functions-routes: www.nieuwsinkort.nl en het productie-pages.dev-adres → 301 naar nieuwsinkort.nl (pad + query behouden);
// previews (*.nieuwsinkort.pages.dev) blijven bruikbaar maar krijgen X-Robots-Tag: noindex (geen duplicaat in de index).
// Via code omdat de Cloudflare-login geen Redirect Rules op de zone mag schrijven; www is custom domain van het Pages-project.
interface Ctx { request: Request; next: () => Promise<Response> }
const WWW = "www.nieuwsinkort.nl";
const APEX = "nieuwsinkort.nl";
const PAGES = "nieuwsinkort.pages.dev";

// Pure keuze: doeladres bij www of productie-pages.dev, anders null (apex, previews en andere hosts blijven ongemoeid).
// Op pages.dev alleen HTML-paginaverzoeken (GET/HEAD): de uur-Worker POST naar /samenvatting en haalt /data.json op via dit adres; een 301 zou de body wissen en een hop kosten.
export const isPaginaVerzoek = (method: string, pad: string): boolean => {
  if (method !== "GET" && method !== "HEAD") return false;
  if (/^\/(samenvatting|meer|media|data\.json|version\.json)(\/|$)/i.test(pad)) return false;
  const laatste = pad.split("/").pop() || "";
  return !laatste.includes(".") || /\.html?$/i.test(laatste);
};

export const wwwDoel = (rawUrl: string, method = "GET"): string | null => {
  let u: URL;
  try { u = new URL(rawUrl); } catch { return null; }
  const h = u.hostname.toLowerCase();
  if (h !== WWW && !(h === PAGES && isPaginaVerzoek(method.toUpperCase(), u.pathname))) return null;
  return `https://${APEX}${u.pathname}${u.search}`;
};

// Pure keuze: preview-host (subdomein van pages.dev-project) of productie-pages.dev (niet-paginaverzoeken) → noindex.
export const isPreview = (rawUrl: string): boolean => {
  try { const h = new URL(rawUrl).hostname.toLowerCase(); return h === PAGES || h.endsWith("." + PAGES); } catch { return false; }
};

export const onRequest = async ({ request, next }: Ctx): Promise<Response> => {
  const doel = wwwDoel(request.url, request.method);
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
