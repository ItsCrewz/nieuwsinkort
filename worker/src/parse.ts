// Kleine, regex-gebaseerde feed-parser (geen DOMParser in Workers). RSS 2.0, Atom, SRU, Google-news-sitemaps, een paar JSON-API's.
export type Entry = { t: string; l: string; d: number | null; s: string; img?: string };

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", hellip: "…", ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", euro: "€", eacute: "é", euml: "ë", iuml: "ï", ouml: "ö", uuml: "ü", aacute: "á", egrave: "è" };
export function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n <= 0x10ffff && (n < 0xd800 || n > 0xdfff) ? String.fromCodePoint(n) : m;
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
export const absUrl = (l: string, base: string): string => { try { if (!l.trim()) return ""; const u = new URL(l.trim(), base); return /^https?:$/.test(u.protocol) ? u.toString() : ""; } catch { return ""; } };
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

// Google-news-sitemap (<urlset>): titel en tijd uit <news:...>, anders <lastmod>; `pad` houdt alleen links met dat padstuk over (ook voor RSS/Atom in parseFeed)
function parseSitemap(body: string, url: string, pad?: string): Entry[] {
  const out: Entry[] = [];
  for (const b of body.match(/<url(?:\s[^>]*)?>[\s\S]*?<\/url>/gi) || []) {
    const l = absUrl(decode(tag(b, ["loc"])), url);
    const t = stripHtml(tag(b, ["news:title"]));
    if (!l || !t || (pad && !new URL(l).pathname.includes(pad))) continue;
    out.push({ t, l, d: date(tag(b, ["news:publication_date", "lastmod"])), s: stripHtml(tag(b, ["news:keywords"])).slice(0, 600) });
  }
  return out;
}

// Met `pad` gezet: alleen een geldige link waarvan het pathname `pad` bevat
function padOk(l: string, pad: string): boolean {
  try { return new URL(l).pathname.includes(pad); } catch { return false; }
}

const ATOM_NS = "http://www.w3.org/2005/Atom";
// Loopt de tags langs met een scope per element (xmlns:p geldt voor het element en zijn nakomelingen, een herdefinitie wint)
// en geeft elk <p:entry> waarvan p op dat punt naar Atom wijst, met alle Atom-prefixen die binnen die entry gelden (punten ge-escaped).
function atomPrefixBlokken(body: string): { i: number; b: string; ps: string[] }[] {
  const out: { i: number; b: string; ps: string[] }[] = [];
  const stack: { n: string; ns: Map<string, string> }[] = [];
  let cur: { i: number; diepte: number; n: string; ps: Set<string> } | null = null;
  const re = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<(\/?)([A-Za-z_][\w.:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
  for (const m of body.matchAll(re)) {
    if (!m[2]) continue;
    const naam = m[2];
    if (m[1]) { // sluittag
      let k = stack.length - 1;
      while (k >= 0 && stack[k].n !== naam) k--;
      if (k < 0) continue;
      stack.length = k;
      if (cur && cur.n === naam && stack.length === cur.diepte) {
        out.push({ i: cur.i, b: body.slice(cur.i, (m.index ?? 0) + m[0].length), ps: [...cur.ps].map((x) => x.replace(/\./g, "\\.")) });
        cur = null;
      }
      continue;
    }
    const ns = new Map(stack.length ? stack[stack.length - 1].ns : []);
    for (const x of m[3].matchAll(/\sxmlns:([A-Za-z_][\w.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) ns.set(x[1], x[2] ?? x[3]);
    const zelf = m[3].endsWith("/");
    const c = naam.indexOf(":");
    const p = c > 0 ? naam.slice(0, c) : "";
    if (cur) for (const [k, v] of ns) if (v === ATOM_NS) cur.ps.add(k);
    if (!cur && p && naam.slice(c + 1) === "entry" && ns.get(p) === ATOM_NS) {
      const ps = new Set<string>([...ns].filter(([, v]) => v === ATOM_NS).map(([k]) => k));
      if (zelf) out.push({ i: m.index ?? 0, b: m[0], ps: [...ps].map((x) => x.replace(/\./g, "\\.")) });
      else cur = { i: m.index ?? 0, diepte: stack.length, n: naam, ps };
    }
    if (!zelf) stack.push({ n: naam, ns });
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
  // Platte <item>/<entry> via regex; Atom met prefix (<atom:entry>) via atomPrefixBlokken (namespace per element)
  const blokken: { i: number; b: string; ps: string[] }[] = atomPrefixBlokken(body);
  for (const bm of body.matchAll(/<item[\s>][\s\S]*?<\/item>|<entry[\s>][\s\S]*?<\/entry>/gi)) blokken.push({ i: bm.index ?? 0, b: bm[0], ps: [] });
  blokken.sort((x, y) => x.i - y.i);
  for (const { b, ps } of blokken) {
    const pn = (n: string[]) => (ps.length ? n.flatMap((x) => [...ps.map((p) => `${p}:${x}`), x]) : n); // prefixed eerst, daarna ongeprefixt
    const t = stripHtml(tag(b, pn(["title"])));
    let l = "";
    // Atom: rel en href los lezen, zodat de volgorde van de attributen niet uitmaakt
    let eerste = "", alt = "";
    for (const m of b.matchAll(new RegExp(`<${ps.length ? `(?:${ps.join("|")}:)?` : ""}link\\b[^>]*>`, "gi"))) {
      // attributen één voor één lezen: een geciteerde waarde wordt in één keer verwerkt en telt nooit als naam
      const at: Record<string, string> = {};
      for (const x of m[0].matchAll(/([^\s=/<>"']+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
        const n = x[1].toLowerCase();
        if (!(n in at)) at[n] = x[2] ?? x[3];
      }
      const h = at.href || "";
      if (!h) continue;
      if (!eerste) eerste = h;
      if (at.rel && /(?:^|\s)alternate(?:\s|$)/i.test(at.rel)) { alt = h; break; }
    }
    l = decode(alt || eerste);
    if (!l) l = decode(tag(b, pn(["link"])));
    if (!l) { const g = tag(b, ["guid"]); if (/^https?:/.test(g)) l = decode(g); }
    l = absUrl(l, url);
    if (pad && !padOk(l, pad)) continue;
    let d = date(tag(b, [...pn(["pubDate", "published"]), "dc:date", ...pn(["updated"]), "a10:updated"]));
    if (kg) d = igTime(l); // Kittygram: geen echte datum in de feed
    const raw = tag(b, [...pn(["description"]), "media:description", ...pn(["summary"]), "content:encoded", ...pn(["content"])]);
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
  if (Array.isArray(j)) return j.map((a: any) => ({ t: a.title || a.Title || "", l: absUrl(String(a.url || a.link || ""), url), d: date(a.date || a.published || a.created || ""), s: a.description || "" }));
  return [];
}
