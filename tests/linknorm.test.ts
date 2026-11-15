// Draai: npm run test  (bundelt met esbuild en draait met node)
import assert from "node:assert/strict";
import { normLink } from "../src/linknorm";

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log("✓", name); };

t("normLink: lege invoer en standaardwaarde geven een lege string", () => {
  assert.equal(normLink(), "");
  assert.equal(normLink(""), "");
});

t("normLink: schema, www en slash aan het eind vallen weg, pad wordt lowercase", () => {
  assert.equal(normLink("https://www.Site.nl/Pad/Artikel/"), "site.nl/pad/artikel");
  assert.equal(normLink("HTTP://site.nl/a"), "site.nl/a");
});

t("normLink: fragment wordt weggehaald, ook na een query", () => {
  assert.equal(normLink("https://site.nl/a#kop"), "site.nl/a");
  assert.equal(normLink("https://site.nl/a?id=1#kop"), "site.nl/a?id=1");
});

t("normLink: trackingparameters verdwijnen, ongeacht hoofdletters", () => {
  for (const p of ["utm", "utm_source", "UTM_Medium", "fbclid", "gclid", "dclid", "msclkid", "mc_cid", "mc_eid"]) {
    assert.equal(normLink(`https://site.nl/a?${p}=x`), "site.nl/a", p);
  }
  assert.equal(normLink("https://site.nl/a?utm_source=x&id=5&fbclid=y"), "site.nl/a?id=5");
});

t("normLink: overige parameters worden gesorteerd op naam en waarde", () => {
  assert.equal(normLink("https://site.nl/a?b=2&a=1"), "site.nl/a?a=1&b=2");
  assert.equal(normLink("https://site.nl/a?a=2&a=1"), "site.nl/a?a=1&a=2");
});

t("normLink: waarden houden hoofdletters en spatie wordt plus", () => {
  assert.equal(normLink("https://site.nl/A?Q=Hallo%20Wereld"), "site.nl/a?Q=Hallo+Wereld");
});

t("normLink: namen die op tracking lijken maar het niet zijn blijven staan", () => {
  assert.equal(normLink("https://site.nl/a?utmx=1&xutm_source=2"), "site.nl/a?utmx=1&xutm_source=2");
});

console.log(`${n} tests ok`);
