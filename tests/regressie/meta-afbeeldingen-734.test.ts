// #734: geldige witruimte rond meta-attributen mag artikelbeelden niet verbergen.
import assert from "node:assert/strict";
import { ogImage, uniekeBeelden } from "../../src/beeld";

const pagina = "https://nieuws.example/artikelen/2026/bericht";
const voorbeelden = [
  [`<html><head><meta property = "og:image" content = "../foto.jpg?w=800&amp;h=450"></head></html>`, "https://nieuws.example/artikelen/foto.jpg?w=800&h=450"],
  [`<meta content\n= '/foto.jpg' property\t=\t'og:image:secure_url'>`, "https://nieuws.example/foto.jpg"],
  [`<meta name = 'twitter:image:src' content= 'https://cdn.example/foto.jpg'>`, "https://cdn.example/foto.jpg"],
  [`<meta content = "foto.jpg" name = "twitter:image">`, "https://nieuws.example/artikelen/2026/foto.jpg"],
  [`<meta property="og:image:url" content="/bestaand.jpg">`, "https://nieuws.example/bestaand.jpg"],
];
for (const [html, verwacht] of voorbeelden) assert.equal(ogImage(html, pagina), verwacht);

for (const html of ["<meta property = 'og:image'>", "<meta property = 'og:image' content = ''>", "<meta property = 'og:image' content = '  '>", "<meta property = 'og:image' content = 'http://['>"]) {
  assert.equal(ogImage(html, pagina), "");
}
assert.deepEqual(uniekeBeelden([ogImage("<meta property = 'og:image' content = '/logo.svg'>", pagina)]), []);
assert.equal(ogImage('<meta name="twitter:image" content="/eerste.jpg"><meta property="og:image" content="/tweede.jpg">', pagina), "https://nieuws.example/eerste.jpg");
