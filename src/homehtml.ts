import { artikelPad } from "./artikelid";
import { ams } from "./tijd";
import { veiligeUrl } from "./url";

type Item = { id?: string; kop: string; bronnen?: { href: string }[] };
type Data = { gegenereerd?: string; dag_samenvatting?: string; items?: Item[] };
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const links = '<p><a href="/vandaag">Nieuws van vandaag</a> · <a href="/over">Over Nieuws in het kort</a></p>';

/** Actuele dagdata als inhoud van het noscript-blok. */
export function homeNoscript(data?: Data | null): string {
  const tijd = Date.parse(data?.gegenereerd || "");
  const dag = Number.isFinite(tijd) ? ams(tijd).iso : "";
  const items = dag && Array.isArray(data?.items) ? data.items.filter((i) => typeof i?.kop === "string" && i.kop.trim()).slice(0, 10) : [];
  const briefing = typeof data?.dag_samenvatting === "string" && data.dag_samenvatting.trim() ? `<h2>In het kort</h2><p>${esc(data.dag_samenvatting)}</p>` : "";
  // Bronlink uit data.json (zoals in de app); zonder geldige bron de interne berichtpagina.
  const link = (i: Item) => { const bron = veiligeUrl(i.bronnen?.[0]?.href); return bron ? `<a href="${esc(bron)}" rel="noopener">` : `<a href="${esc(artikelPad(i, dag))}">`; };
  const koppen = items.length ? `<ul>${items.map((i) => `<li>${link(i)}${esc(i.kop)}</a></li>`).join("")}</ul>` : "";
  return `<main><h1>Nieuws in het kort</h1>${dag ? briefing : ""}${koppen}${links}</main>`;
}
