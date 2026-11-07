// Serverpagina /bericht/…: de echte app-HTML (index.html) met per bericht eigen title/description/OG/JSON-LD in de head,
// zodat de gedeelde link exact dezelfde weergave opent als in de app. Binnen #root staat tekst voor crawlers; React vervangt die bij het starten.
import { artikelPad } from "./artikelid";
import { beeldProxyPad } from "./beeldhost";
import { veiligeUrl } from "./url";

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
type Bericht = { id?: string; kop: string; ai?: string; samenvatting?: string; punten?: string[]; bronnen?: { site: string; href: string }[]; ruw?: boolean; cat?: string; t?: number | string; beeld?: string; beelden?: string[] };
type Verwant = { id?: string; kop: string; bronnen?: { href: string }[] };
const BASIS = "https://nieuwsinkort.nl";
// Beschrijving op een woordgrens (≤ 155 tekens, geen afgebroken woord); eerste zin(nen) van de samenvatting.
export function beschrijving(tekst: string): string {
  const t = tekst.replace(/\s+/g, " ").trim();
  if (t.length <= 155) return t;
  const knip = t.slice(0, 155), i = knip.lastIndexOf(" ");
  return `${(i > 80 ? knip.slice(0, i) : knip).replace(/[\s,;:.-]+$/, "")}…`;
}
// Eerste artikelfoto via onze eigen beeldproxy (absoluut, op eigen domein); anders de standaard og-afbeelding.
export function berichtBeeld(item: Bericht): string | null {
  const p = [item.beeld, ...(item.beelden || [])].map((u) => (u ? beeldProxyPad(u) : null)).find(Boolean);
  return p ? `${BASIS}${p}` : null;
}
// Vervang de content van één meta-tag (op name of property); bestaat hij niet, dan wordt hij vlak voor </head> toegevoegd.
function zetMeta(html: string, attr: "name" | "property", sleutel: string, waarde: string): string {
  const tag = `<meta ${attr}="${sleutel}" content="${esc(waarde)}" />`;
  const re = new RegExp(`<meta\\s+${attr}="${sleutel}"[^>]*>`, "i");
  return re.test(html) ? html.replace(re, () => tag) : html.replace("</head>", () => `${tag}</head>`);
}
export function berichtHtml(sjabloon: string, item: Bericht, dag: string, verwant: Verwant[] = []): string {
  const url = `https://nieuwsinkort.nl${artikelPad(item, dag)}`, title = item.kop, indexeer = !item.ruw && item.cat !== "politiek";
  const tekst = indexeer ? item.ai || "" : "", desc = beschrijving(tekst || (indexeer ? item.samenvatting || "" : "")) || "Het nieuws van vandaag in het kort.", beeld = berichtBeeld(item) || `${BASIS}/og-image.png`;
  const bronnen = (item.bronnen || []).filter((b) => veiligeUrl(b.href));
  const tms = item.t ? new Date(item.t).getTime() : NaN, datum = Number.isFinite(tms) ? new Date(tms).toISOString() : `${dag}T00:00:00+01:00`; // ongeldige t mag de pagina niet breken
  const json = JSON.stringify({ "@context": "https://schema.org", "@type": "NewsArticle", headline: title.slice(0, 110), datePublished: datum, dateModified: datum, inLanguage: "nl-NL", description: desc, mainEntityOfPage: url, author: { "@type": "Organization", name: "Nieuws in het kort", url: BASIS }, publisher: { "@type": "NewsMediaOrganization", name: "Nieuws in het kort", url: `${BASIS}/`, logo: { "@type": "ImageObject", url: `${BASIS}/icon-512.png`, width: 512, height: 512 } }, image: [beeld], isBasedOn: bronnen.map((b) => b.href), citation: bronnen.map((b) => b.href) }).replace(/</g, "\\u003c");
  let h = sjabloon.replace(/<title>[\s\S]*?<\/title>/, () => `<title>${esc(title)} – Nieuws in het kort</title>`)
    .replace(/<link rel="canonical"[^>]*>/, () => `<link rel="canonical" href="${esc(url)}" />`)
    .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, () => `<script type="application/ld+json">${json}</script>`);
  h = zetMeta(h, "name", "description", desc);
  h = zetMeta(h, "name", "robots", indexeer ? "max-image-preview:large" : "noindex");
  h = zetMeta(h, "property", "og:type", "article");
  h = zetMeta(h, "property", "og:title", title);
  h = zetMeta(h, "property", "og:description", desc);
  h = zetMeta(h, "property", "og:url", url);
  h = zetMeta(h, "property", "og:image", beeld);
  if (berichtBeeld(item)) h = h.replace(/<meta property="og:image:(width|height)"[^>]*>/g, ""); // 1200×630 geldt alleen voor de standaardafbeelding
  h = zetMeta(h, "name", "twitter:image", beeld);
  h = zetMeta(h, "property", "article:published_time", datum);
  h = zetMeta(h, "name", "twitter:title", title);
  h = zetMeta(h, "name", "twitter:description", desc);
  const body = `<article><h1>${esc(title)}</h1>${tekst ? `<p>${esc(tekst)}</p>` : ""}${indexeer && item.samenvatting ? `<p>${esc(item.samenvatting)}</p>` : ""}${indexeer && item.punten?.length ? `<ul>${item.punten.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>` : ""}<h2>Bronnen</h2><ul>${bronnen.map((b) => `<li><a href="${esc(b.href)}" rel="noopener nofollow">${esc(b.site)}</a></li>`).join("")}</ul>${verwant.length ? `<h2>Meer nieuws</h2><ul>${verwant.map((v) => `<li><a href="${esc(artikelPad(v, dag))}">${esc(v.kop)}</a></li>`).join("")}</ul>` : ""}<p><a href="/vandaag">Al het nieuws van vandaag</a> · <a href="/">Naar Nieuws in het kort</a></p></article>`;
  return h.replace('<div id="root"></div>', () => `<div id="root">${body}</div>`);
}
