// Kleine, regex-gebaseerde feed-parser (geen DOMParser in Workers). RSS 2.0, Atom, SRU, Google-news-sitemaps, een paar JSON-API's.
export type Entry = { t: string; l: string; d: number | null; s: string; img?: string };

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", hellip: "…", ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", euro: "€", eacute: "é", euml: "ë", iuml: "ï", ouml: "ö", uuml: "ü", aacute: "á", egrave: "è" };
export function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENT[e.toLowerCase()] ?? m;
  });
}
const cdata = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
export const stripHtml = (s: string): string =>
  /&lt;\/?[a-z]/i.test(s) ? stripHtml(decode(cdata(s))) : decode(cdata(s).replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<br\s*\/?>|<\/p>/gi, " ").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
// Alleen http(s), relatieve links worden absoluut: een feed mag geen javascript:-href aanleveren
export const absUrl = (l: string, base: string): string => { try { const u = new URL(l.trim(), base); return /^https?:$/.test(u.protocol) ? u.toString() : ""; } catch { return ""; } };
function tag(block: string, names: string[]): string {
  for (const n of names) {
    const re = new RegExp(`<${n}(?:\\s[^>]*)?>([\\s\\S]*?)</${n}>`, "i");
    const m = re.exec(block);
    if (m) return cdata(m[1]).trim();
  }
  return "";
}
function date(s: string): number | null {
  if (!s) return null;
  s = s.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s += "T12:00:00+01:00"; // alleen een datum: midden op de dag
  const t = Date.parse(s.replace(/\s(CET|CEST)$/, (_m, z) => (z === "CEST" ? " +0200" : " +0100")));
  return Number.isFinite(t) ? t : null;
}
// Instagram-shortcode -> echte posttijd (Kittygram's <updated> is de ophaaltijd)
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
export function igTime(link: string): number | null {
  const m = /\/p\/([A-Za-z0-9_-]{6,14})(?:[/?#]|$)/.exec(link);
  if (!m) return null;
  let n = 0n;
  for (const c of m[1]) n = n * 64n + BigInt(B64.indexOf(c));
  const t = Number(n >> 23n) + 1314220021721;
  return t > 1.3e12 && t < Date.now() + 864e5 ? t : null;
}

// Google-news-sitemap (<urlset>): titel en tijd uit <news:...>, anders <lastmod>; `pad` houdt alleen links met dat padstuk over
function parseSitemap(body: string, url: string, pad?: string): Entry[] {
  const out: Entry[] = [];
  for (const b of body.match(/<url>[\s\S]*?<\/url>/gi) || []) {
    const l = absUrl(decode(tag(b, ["loc"])), url);
    const t = stripHtml(tag(b, ["news:title"]));
    if (!l || !t || (pad && !new URL(l).pathname.includes(pad))) continue;
    out.push({ t, l, d: date(tag(b, ["news:publication_date", "lastmod"])), s: stripHtml(tag(b, ["news:keywords"])).slice(0, 600) });
  }
  return out;
}

export function parseFeed(body: string, url: string, pad?: string): Entry[] {
  const head = body.slice(0, 400).trim();
  if (head[0] === "{" || head[0] === "[") return parseJson(body, url);
  const out: Entry[] = [];
  if (/searchRetrieveResponse/.test(head + body.slice(0, 2000))) {
    for (const r of body.split(/<sru:record>/).slice(1)) {
      const t = stripHtml(tag(r, ["dcterms:title"]));
      const l = absUrl(decode(/resourceIdentifier="([^"]+)"/.exec(r)?.[1] || ""), url);
      const d = date(tag(r, ["dcterms:available", "dcterms:modified", "dcterms:date"]));
      const typ = tag(r, ["dcterms:type"]);
      if (t) out.push({ t, l, d, s: `${typ}: ${stripHtml(tag(r, ["dcterms:abstract"]))}`.slice(0, 400) });
    }
    return out;
  }
  if (/<urlset[\s>]/i.test(body.slice(0, 2000))) return parseSitemap(body, url, pad);
  const kg = /kg\.meowing\.de|kittygram/i.test(url);
  const blocks = body.match(/<item[\s>][\s\S]*?<\/item>|<entry[\s>][\s\S]*?<\/entry>/gi) || [];
  for (const b of blocks) {
    const t = stripHtml(tag(b, ["title"]));
    let l = "";
    const alt = /<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i.exec(b) || /<link[^>]*href=["']([^"']+)["']/i.exec(b);
    if (alt) l = decode(alt[1]);
    if (!l) l = decode(tag(b, ["link"]));
    if (!l) { const g = tag(b, ["guid"]); if (/^https?:/.test(g)) l = decode(g); }
    l = absUrl(l, url);
    let d = date(tag(b, ["pubDate", "published", "dc:date", "updated", "a10:updated"]));
    if (kg) d = igTime(l); // Kittygram: geen echte datum in de feed
    const raw = tag(b, ["description", "media:description", "summary", "content:encoded", "content"]);
    const img = /<media:(?:thumbnail|content)[^>]*url=["']([^"']+)["']/i.exec(b)?.[1] || /<enclosure[^>]*url=["']([^"']+\.(?:jpe?g|png|webp)[^"']*)["']/i.exec(b)?.[1];
    if (t || l) out.push({ t, l, d, s: stripHtml(raw).slice(0, 600), ...(img && absUrl(decode(img), url) ? { img: absUrl(decode(img), url) } : {}) });
  }
  return out;
}

function parseJson(body: string, url: string): Entry[] {
  let j: any;
  try { j = JSON.parse(body); } catch { throw new Error("geen geldige JSON"); }
  if (Array.isArray(j?.vulnerabilities)) // CISA KEV
    return j.vulnerabilities.map((v: any) => ({ t: `${v.cveID}: ${v.vulnerabilityName}`, l: `https://nvd.nist.gov/vuln/detail/${v.cveID}`, d: date(v.dateAdded), s: v.shortDescription || "" }));
  if (Array.isArray(j?.hits?.hits)) // Open Raadsinformatie
    return j.hits.hits.map((h: any) => { const s = h._source || {}; return { t: s.name || "", l: `https://id.openraadsinformatie.nl/${h._id}`, d: date(s.start_date || s.last_discussed_at || s.date_modified || ""), s: "" }; });
  if (Array.isArray(j)) return j.map((a: any) => ({ t: a.title || a.Title || "", l: absUrl(String(a.url || a.link || ""), url) || url, d: date(a.date || a.published || a.created || ""), s: a.description || "" }));
  return [];
}
