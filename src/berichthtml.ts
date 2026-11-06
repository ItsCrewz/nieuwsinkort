// Serverpagina /bericht/…: de echte app-HTML (index.html) met per bericht eigen title/description/OG/JSON-LD in de head,
// zodat de gedeelde link exact dezelfde weergave opent als in de app. Binnen #root staat tekst voor crawlers; React vervangt die bij het starten.
import { artikelPad } from "./artikelid";
import { veiligeUrl } from "./url";

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
type Bericht = { id?: string; kop: string; ai?: string; samenvatting?: string; punten?: string[]; bronnen?: { site: string; href: string }[]; ruw?: boolean; cat?: string; t?: number | string };
// Vervang de content van één meta-tag (op name of property); bestaat hij niet, dan wordt hij vlak voor </head> toegevoegd.
function zetMeta(html: string, attr: "name" | "property", sleutel: string, waarde: string): string {
  const tag = `<meta ${attr}="${sleutel}" content="${esc(waarde)}" />`;
  const re = new RegExp(`<meta\\s+${attr}="${sleutel}"[^>]*>`, "i");
  return re.test(html) ? html.replace(re, () => tag) : html.replace("</head>", () => `${tag}</head>`);
}
export function berichtHtml(sjabloon: string, item: Bericht, dag: string): string {
  const pad = artikelPad(item, dag), url = `https://nieuwsinkort.nl${pad || "/"}`, title = item.kop, indexeer = !item.ruw && item.cat !== "politiek";
  const tekst = indexeer ? item.ai || "" : "", desc = tekst.slice(0, 160) || "Het nieuws van vandaag in het kort.";
  const bronnen = (item.bronnen || []).filter((b) => veiligeUrl(b.href));
  const tms = item.t ? new Date(item.t).getTime() : NaN, datum = Number.isFinite(tms) ? new Date(tms).toISOString() : `${dag}T00:00:00+01:00`; // ongeldige t mag de pagina niet breken
  const json = JSON.stringify({ "@context": "https://schema.org", "@type": "NewsArticle", headline: title.slice(0, 110), datePublished: datum, dateModified: datum, inLanguage: "nl", mainEntityOfPage: url, publisher: { "@type": "NewsMediaOrganization", name: "Nieuws in het kort", url: "https://nieuwsinkort.nl" }, image: "https://nieuwsinkort.nl/og-image.png", isBasedOn: bronnen.map((b) => b.href), citation: bronnen.map((b) => b.href) }).replace(/</g, "\\u003c");
  let h = sjabloon.replace(/<title>[\s\S]*?<\/title>/, () => `<title>${esc(title)} – Nieuws in het kort</title>`)
    .replace(/<link rel="canonical"[^>]*>/, () => `<link rel="canonical" href="${esc(url)}" />`)
    .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, () => `<script type="application/ld+json">${json}</script>`);
  h = zetMeta(h, "name", "description", desc);
  h = zetMeta(h, "name", "robots", indexeer ? "max-image-preview:large" : "noindex");
  h = zetMeta(h, "property", "og:type", "article");
  h = zetMeta(h, "property", "og:title", title);
  h = zetMeta(h, "property", "og:description", desc);
  h = zetMeta(h, "property", "og:url", url);
  h = zetMeta(h, "property", "article:published_time", datum);
  h = zetMeta(h, "name", "twitter:title", title);
  h = zetMeta(h, "name", "twitter:description", desc);
  const body = `<article><h1>${esc(title)}</h1>${tekst ? `<p>${esc(tekst)}</p>` : ""}${indexeer && item.samenvatting ? `<p>${esc(item.samenvatting)}</p>` : ""}${indexeer && item.punten?.length ? `<ul>${item.punten.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>` : ""}<h2>Bronnen</h2><ul>${bronnen.map((b) => `<li><a href="${esc(b.href)}" rel="noopener nofollow">${esc(b.site)}</a></li>`).join("")}</ul><p><a href="/">Naar het nieuws van vandaag</a></p></article>`;
  return h.replace('<div id="root"></div>', () => `<div id="root">${body}</div>`);
}
