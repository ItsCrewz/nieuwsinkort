// Noscript-inhoud voor de startpagina (#313); gebruikt door scripts/build-noscript.mjs en tests/noscript-koppen.test.ts.
const MAX_KOPPEN = 10;
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const veiligeUrl = (u) => (u && /^https?:\/\//i.test(u.trim()) ? u : undefined); // zelfde regel als src/url.ts

/** Inhoud van <noscript>: dezelfde dag_samenvatting en koppen als data.json; zonder data alleen de link naar /vandaag. */
export function noscriptHtml(dag) {
  const koppen = (Array.isArray(dag?.items) ? dag.items : []).filter((i) => typeof i?.kop === "string" && i.kop.trim()).slice(0, MAX_KOPPEN);
  const samenvatting = typeof dag?.dag_samenvatting === "string" && dag.dag_samenvatting.trim() ? `<h2>In het kort</h2><p>${esc(dag.dag_samenvatting.trim())}</p>` : "";
  const lijst = koppen.map((i) => {
    const b = i.bronnen?.[0], href = veiligeUrl(b?.href);
    return `<li>${href ? `<a href="${esc(href)}">${esc(i.kop)}</a>` : esc(i.kop)}${b?.site ? ` (${esc(b.site)})` : ""}</li>`;
  }).join("");
  return `<main><h1>Nieuws in het kort</h1><p>Zet JavaScript aan voor de volledige site.</p>${samenvatting}${lijst ? `<h2>Koppen</h2><ul>${lijst}</ul>` : ""}<p><a href="/vandaag">Het nieuws van vandaag per rubriek</a></p></main>`;
}

/** Vervangt de inhoud van de eerste <noscript> (functie als vervanger: geen $-patronen uit de data). */
export const metNoscript = (html, binnen) => html.replace(/<noscript>[\s\S]*?<\/noscript>/, () => `<noscript>${binnen}</noscript>`);
