// Foto's bij een bericht: verzamelen uit alle bronnen, logo's/placeholders/kleine plaatjes weg, dubbele weg.
// Gedeeld door site, Pages Function en uur-Worker (zelfde regels overal).
// Dubbel = zelfde URL zonder query/maat, of hetzelfde CDN-beeld-id in een andere maat (bv. /1200x675/ vs /600x338/).
// Bijna-gelijke foto's (zelfde persfoto bij twee sites) vangt de routine met een perceptuele hash (scripts/add-beelden.mjs).

const SKIP = /logo|placeholder|default[-_.]|fallback|avatar|favicon|icon[-_.]|sprite|blank|spacer|pixel|1x1|no[-_]?image|og[-_]default|share[-_]default|brand|badge|emoji|gravatar|\.svg(\?|$)|\.gif(\?|$)|feeds\.feedburner|doubleclick|tracking/i;

/** Klein plaatje volgens de URL zelf (?w=120, /100x100/, _thumb, s72-c …). */
function tooSmall(u: string): boolean {
  const q = /[?&](?:w|width|resize|imwidth|im_w)=(\d+)/i.exec(u);
  if (q && +q[1] < 300) return true;
  const d = /[/_-](\d{2,4})x(\d{2,4})(?:[/_.-]|$)/.exec(u);
  if (d && (+d[1] < 300 || +d[2] < 160)) return true;
  if (/\/s(\d{2,3})(-c)?\//.test(u) && +(/\/s(\d{2,3})/.exec(u)![1]) < 300) return true;
  return /[_-](thumb|thumbnail|small|mini|tiny)\b/i.test(u);
}

export function goedBeeld(u?: string | null): u is string {
  if (!u || typeof u !== "string" || !/^https?:\/\//.test(u) || u.length > 1200) return false;
  if (/youtube\.com\/(v|embed|watch)\b|youtu\.be\//i.test(u)) return false; // video-link, geen foto
  return !SKIP.test(u) && !tooSmall(u);
}

/** Sleutel voor 'zelfde foto': host-familie + bestandsnaam zonder maat/kwaliteit/extensie. */
export function beeldKey(u: string): string {
  let x: URL;
  try { x = new URL(u); } catch { return u; }
  // Proxies/resizers met het echte adres in de query (Next.js, wsrv, imgix-proxy …)
  const inner = x.searchParams.get("url") || x.searchParams.get("src") || x.searchParams.get("u");
  if (inner && /^https?:\/\//.test(inner)) return beeldKey(inner);
  // WordPress-Jetpack (i0.wp.com/<site>/<pad>): de echte site staat in het pad
  if (/^i\d\.wp\.com$/.test(x.hostname)) { const [h, ...rest] = x.pathname.split("/").filter(Boolean); try { x = new URL(`https://${h}/${rest.join("/")}`); } catch { /* laat staan */ } }
  const segs = x.pathname.split("/").filter(Boolean);
  let file = (segs.pop() || "").toLowerCase();
  // maat in de map ('/1200x675/abc.jpg', '/w_800,h_450,c_fill/abc.jpg') negeren: alleen bestandsnaam telt
  file = file
    .replace(/\.(jpe?g|png|webp|avif)$/i, "")
    .replace(/[@_-]\d{2,4}x\d{0,4}$/, "").replace(/[@_-]\d{2,4}w$/, "").replace(/@\dx$/, "")
    .replace(/[-_](large|medium|small|thumb|full|orig|original|hd|sd|crop|cropped|scaled)$/i, "");
  // bestandsnaam is alleen een maat (NOS: /1234567/1024x576a.jpg): het id zit in de map
  if (/^\d{2,4}x\d{2,4}[a-z]?$|^w\d{2,4}$/.test(file)) file = segs.slice(-2).join("/");
  // zeer generieke bestandsnamen ('image', 'index', '1') hebben de map nodig
  if (file.length < 6 || /^(image|img|index|photo|foto|default|original|large|full)$/.test(file)) file = `${segs.slice(-2).join("/")}/${file}`;
  const fam = x.hostname.replace(/^(www|cdn\d*|img\d*|images?\d*|static\d*|media\d*|i\d*)\./, "").split(".").slice(-2).join(".");
  return `${fam}|${file}`;
}

/** Unieke, bruikbare foto's in volgorde van binnenkomst (eerste bron eerst), max `max`. */
/** Opschonen + kleine feed-thumbnails naar een groter formaat (NU.nl geeft 256px-vierkantjes in RSS). */
export function beterBeeld(raw: string): string {
  let u = raw.trim().replace(/&amp;/g, "&").replace(/&#x3[dD];/g, "=").replace(/&#61;/g, "=").replace(/&#x26;|&#38;/g, "&");
  const nu = u.match(/^(https:\/\/images\.nu\.nl\/m\/[a-z0-9]+)_sqr\d+\//i);
  if (nu) u = `${nu[1]}_wd1280.jpg`;
  return u;
}

/** Kleinere variant voor het scherm via maatparameters die de bron zelf kent; onbekende bronnen blijven ongemoeid.
 *  De breedte staat per bron (BEELD_BREEDTE): die geeft het kleinste bestand (doel ≤150 kB), RTL is bij 1024 px kleiner dan bij 800 px.
 *  Alleen verkleinen, nooit vergroten. Faalt de variant, dan valt de weergave terug op het origineel (zie beelden.tsx). */
export const BEELD_BREEDTE = { rtl: 1024, pxr: 800, fd: 800, wp: 800, nrc: 800, blogger: 800, nu: 640 };
export function schermBeeld(u: string): string {
  let x: URL;
  try { x = new URL(u); } catch { return u; }
  const h = x.hostname, p = x.searchParams;
  const w = +(p.get("width") || p.get("w") || 0), hh = +(p.get("height") || p.get("h") || 0);
  const rtl = h === "redactie.rtl.nl";
  if (rtl || h === "webp.br.cdn.pxr.nl" || /\.fd\.nl$/.test(h)) {
    const m = rtl ? BEELD_BREEDTE.rtl : /\.fd\.nl$/.test(h) ? BEELD_BREEDTE.fd : BEELD_BREEDTE.pxr;
    if (w <= m) return u;
    const k = p.has("width") ? "width" : "w", l = p.has("height") ? "height" : "h";
    p.set(k, String(m));
    if (hh && w) p.set(l, String(Math.round(hh * m / w)));
    return x.toString();
  }
  if (p.has("resize") && /^(techcrunch\.com|[^.]+\.wp\.com)$/.test(h)) {
    const m = /^(\d+),(\d+)$/.exec(p.get("resize")!), b = BEELD_BREEDTE.wp;
    if (!m || +m[1] <= b) return u;
    p.set("resize", `${b},${Math.round(+m[2] * b / +m[1])}`);
    return x.toString().replace("%2C", ",");
  }
  if (h === "images.nrc.nl") return u.replace(/\/(\d{4,})x\//, (a, n) => (+n > BEELD_BREEDTE.nrc ? `/${BEELD_BREEDTE.nrc}x/` : a));
  if (h === "blogger.googleusercontent.com") return u.replace(/\/s(\d{4})\//, (a, n) => (+n > BEELD_BREEDTE.blogger ? `/s${BEELD_BREEDTE.blogger}/` : a));
  if (h === "images.nu.nl") return u.replace(/_wd(\d{4})\.jpg/, (a, n) => (+n > BEELD_BREEDTE.nu ? `_wd${BEELD_BREEDTE.nu}.jpg` : a));
  return u;
}

export function uniekeBeelden(urls: (string | null | undefined)[], max = 6): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of urls) {
    const u = typeof raw === "string" ? beterBeeld(raw) : "";
    if (!goedBeeld(u)) continue;
    const k = beeldKey(u);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(u.replace(/^http:\/\//, "https://"));
    if (out.length >= max) break;
  }
  return out;
}

/** og:image / twitter:image uit (het begin van) een HTML-pagina. */
export function ogImage(html: string, base: string): string {
  const m =
    /<meta[^>]+(?:property|name)=["'](?:og:image(?::secure_url|:url)?|twitter:image(?::src)?)["'][^>]*content=["']([^"']+)["']/i.exec(html) ||
    /<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["'](?:og:image(?::secure_url|:url)?|twitter:image(?::src)?)["']/i.exec(html);
  if (!m) return "";
  try { return new URL(m[1].replace(/&amp;/g, "&"), base).toString(); } catch { return ""; }
}
