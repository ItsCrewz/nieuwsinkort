import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server.browser";
import { DetailView } from "../src/detail";
import type { Item } from "../src/types";

// Server-render: effecten draaien niet, dus geen netwerk, klok of window nodig.
const basis: Item = {
  cat: "nl",
  kop: "Kop & <titel>",
  ai: "Korte samenvatting.",
  samenvatting: "Eerste alinea.\n\nTweede alinea.",
  punten: ["Punt een", "Punt twee"],
  tijd: "12:30",
  bronnen: [
    { site: "NOS", href: "https://www.nos.nl/artikel/1" },
    { site: "RTL", href: "javascript:alert(1)" },
  ],
};
const toon = (item: Item, bionic = false) => renderToStaticMarkup(createElement(DetailView, { item, onBack: () => {}, bionic }));

const html = toon(basis);
assert.match(html, /<article class="detail cat-nl">/);
assert.match(html, /Terug naar het nieuws/);
assert.match(html, /<h1 class="d-title" tabindex="-1">Kop &amp; &lt;titel&gt;<\/h1>/);
assert.match(html, /Nederland/);
assert.match(html, /<time class="tnum">12:30<\/time>/);
assert.match(html, /2 bronnen/);
assert.match(html, /<p class="d-lead bn">Korte samenvatting\.<\/p>/);
assert.match(html, /<p>Eerste alinea\.<\/p><p>Tweede alinea\.<\/p>/);
assert.match(html, /aria-label="Belangrijkste punten"/);
assert.match(html, /<li>Punt een<\/li><li>Punt twee<\/li>/);
assert.match(html, /aria-label="Uitgebreid"/);
assert.match(html, /href="https:\/\/www\.nos\.nl\/artikel\/1"/);
assert.match(html, /<span class="s-out">nos\.nl<\/span>/);
assert.doesNotMatch(html, /href="javascript:/);
assert.doesNotMatch(html, /nog niet samengevat|Meer tekst laden/);
console.log("Detail: kop, tekst, punten en bronnen geslaagd");

const kaal = toon({ ...basis, ai: "", samenvatting: "", punten: [], bronnen: [], tijd: "", ruw: true });
assert.match(kaal, /nog niet samengevat/);
assert.match(kaal, /Geen bronnen bij dit bericht\./);
assert.doesNotMatch(kaal, /d-lead|<time|Belangrijkste punten|\d bronnen?<\/span>/);
assert.equal(toon({ ...basis, bronnen: [basis.bronnen[0]] }).includes("1 bron<"), true);
console.log("Detail: lege velden en ruw geslaagd");

assert.match(toon({ ...basis, meer: "sleutel" }), /aria-busy="true" aria-label="Meer tekst laden"/);
assert.match(toon({ ...basis, cat: "voetbal" }), /class="detail cat-voetbal"/);
assert.match(toon({ ...basis, beelden: ["https://example.com/a.jpg"] }), /d-img/);
assert.doesNotMatch(toon(basis, true), /<p class="d-lead bn">Korte samenvatting\.<\/p>/);
console.log("Detail: laden, categorie, beelden en bionic geslaagd");
