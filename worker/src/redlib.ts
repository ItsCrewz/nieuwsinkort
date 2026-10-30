// Redlib (privacy-frontend voor Reddit) als terugval wanneer Reddit-RSS weigert.
// Publieke instances wisselen vaak en zitten soms achter een botcheck (Anubis/Cloudflare): we roteren
// per uur en accepteren alleen een pagina met echte posts. De HTML wordt omgezet naar Atom, zodat de
// gewone Reddit-parsers (nieuws + filmpjes) hem zonder aanpassing lezen. v.redd.it-video's blijven
// via HLS in de site afspelen.
export const REDLIB = [
  "red.artemislena.eu", "safereddit.com", "redlib.privadency.com", "redlib.4o1x5.dev",
  "redlib.privacyredirect.com", "redlib.catsarch.com", "l.opnxng.com", "redlib.nadeko.net", "redlib.ducks.party",
];

/** reddit-RSS-url -> redlib-pad, bv. /r/europe/top/.rss?t=day -> /r/europe/top?t=day */
export function redlibPath(url: string): string | null {
  const m = /reddit\.com(\/r\/[^/?#]+)(?:\/(hot|new|top|rising))?\/?(?:\.rss)?\/?(\?[^#]*)?/.exec(url);
  if (!m) return null;
  return `${m[1]}${m[2] ? "/" + m[2] : ""}${m[3] || ""}`;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const unesc = (s: string) => s.replace(/&#38;|&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

/** Redlib-HTML -> Atom. Geeft null als de pagina geen posts bevat (botcheck, foutpagina). */
export function redlibToAtom(html: string, host: string): string | null {
  const blocks = html.split(/<div class="post" id="/).slice(1);
  if (!blocks.length || !/class="post_title"/.test(html)) return null;
  const entries: string[] = [];
  for (const b of blocks) {
    const id = /^([a-z0-9]+)"/.exec(b)?.[1];
    const title = /<h2 class="post_title">[\s\S]*?<a href="(\/r\/[^"]+\/comments\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/.exec(b);
    if (!id || !title) continue;
    const created = /<span class="created" title="([^"]+)"/.exec(b)?.[1] || "";
    const t = Date.parse(created.replace(",", "").replace(" UTC", "Z").replace(/^(\w+ \d+ \d+) /, "$1 "));
    const pub = isNaN(t) ? new Date().toISOString() : new Date(t).toISOString();
    const links: string[] = [];
    // video: redlib proxyt v.redd.it als /vid/<id>/... of /hls/<id>/...
    for (const m of b.matchAll(/(?:src|href|data-url)="\/(?:vid|hls)\/([A-Za-z0-9]+)\//g)) links.push(`https://v.redd.it/${m[1]}`);
    for (const m of b.matchAll(/class="post_thumbnail[^"]*" href="(https?:[^"]+)"/g)) links.push(unesc(m[1]));
    const img = (/poster="(\/preview\/[^"]+)"/.exec(b) || /class="post_thumbnail[\s\S]*?<img[^>]*src="(\/preview\/[^"]+)"/.exec(b))?.[1];
    // redlib-proxy-pad terug naar Reddit's eigen beeldserver (redlib-hosts hebben soms een botcheck)
    const imgUrl = img ? unesc(img).replace(/^\/preview\/external-pre\//, "https://external-preview.redd.it/").replace(/^\/preview\/pre\//, "https://preview.redd.it/") : "";
    const content = links.map((l) => `<a href="${esc(l)}">${esc(l)}</a>`).join(" ");
    entries.push(`<entry><id>t3_${id}</id><title>${esc(unesc(title[2].trim()))}</title><link href="https://www.reddit.com${esc(unesc(title[1]))}"/><published>${pub}</published><updated>${pub}</updated>` +
      (/^https:/.test(imgUrl) ? `<media:thumbnail url="${esc(imgUrl)}"/>` : "") + `<content type="html">${esc(content)}</content></entry>`);
  }
  if (!entries.length) return null;
  return `<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/"><title>redlib ${host}</title>${entries.join("")}</feed>`;
}
