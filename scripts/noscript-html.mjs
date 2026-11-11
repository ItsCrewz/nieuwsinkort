// Een statische build kan na middernacht niet meer garanderen dat nieuws actueel is.
export function noscriptHtml() {
  return `<main><h1>Nieuws in het kort</h1><p>Bekijk het actuele nieuws zonder JavaScript op de pagina van vandaag.</p><p><a href="/vandaag">Nieuws van vandaag</a> · <a href="/over">Over Nieuws in het kort</a></p></main>`;
}

/** Vervangt de inhoud van de eerste <noscript>. */
export const metNoscript = (html, binnen) => html.replace(/<noscript>[\s\S]*?<\/noscript>/, () => `<noscript>${binnen}</noscript>`);
