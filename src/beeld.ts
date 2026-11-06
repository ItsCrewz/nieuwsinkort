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

/** Mapsegment dat alleen een maat/transformatie is ('1200x675', 'w800', '640', 's640-c', 'w_800,h_450,c_fill', 'large'): hoort niet bij de identiteit.
 *  Cloudinary-tokens zijn per komma gescheiden en bevatten zelf geen komma, dus de regex is eenduidig (geen backtracking-explosie);
 *  'id_123' is bewust géén maat. Getal-mappen alleen bij gangbare breedtes, zodat jaartallen en artikel-id's blijven tellen. */
const CLD = "(?:w|h|c|q|f|g|ar|dpr|e)_[^/,]+";
const MAATMAP = new RegExp(`^(\\d{2,4}x\\d{2,4}[a-z]?|w\\d{2,4}|h\\d{2,4}|s\\d{2,4}(-c)?|${CLD}(?:,${CLD})*|(?:100|150|200|240|300|320|400|480|500|600|640|720|768|800|960|1024|1080|1200|1280|1440|1600|1920|2048)|[wh]|q\\d{2,3}|thumbs?|thumbnails?|large|medium|small|full|orig|original|scaled|resize|resized|crop(ped)?)$`);

/** Sleutel voor 'zelfde foto': host-familie + inhoudspad + bestandsnaam zonder maat/kwaliteit/extensie. */
export function beeldKey(u: string): string {
  let x: URL;
  try { x = new URL(u); } catch { return u; }
  // Proxies/resizers met het echte adres in de query (Next.js, wsrv, imgix-proxy …)
  const inner = x.searchParams.get("url") || x.searchParams.get("src") || x.searchParams.get("u");
  if (inner && /^https?:\/\//.test(inner)) return beeldKey(inner);
  // WordPress-Jetpack (i0.wp.com/<site>/<pad>): de echte site staat in het pad
  if (/^i\d\.wp\.com$/.test(x.hostname)) { const [h, ...rest] = x.pathname.split("/").filter(Boolean); try { x = new URL(`https://${h}/${rest.join("/")}`); } catch { /* laat staan */ } }
  const segs = x.pathname.split("/").filter(Boolean);
  const alle = segs.slice(0, -1);
  let file = (segs.pop() || "").toLowerCase();
  // maatmappen ('/1200x675/abc.jpg', '/w_800,h_450,c_fill/abc.jpg') negeren; de overige map telt mee,
  // zodat dezelfde bestandsnaam in een andere artikelmap een andere foto blijft
  segs.length = 0;
  for (const m of alle) if (!MAATMAP.test(m.toLowerCase())) segs.push(m.toLowerCase());
  file = file
    .replace(/\.(jpe?g|png|webp|avif)$/i, "")
    .replace(/[@_-]\d{2,4}x\d{0,4}$/, "").replace(/[@_-]\d{2,4}w$/, "").replace(/@\dx$/, "")
    .replace(/[-_](large|medium|small|thumb|full|orig|original|hd|sd|crop|cropped|scaled)$/i, "");
  // bestandsnaam is alleen een maat (NOS: /1234567/1024x576a.jpg): het id zit in de map
  file = /^\d{2,4}x\d{2,4}[a-z]?$|^w\d{2,4}$/.test(file) ? segs.join("/") : [...segs, file].join("/");
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
