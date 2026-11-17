import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server.browser";
import { DetailView } from "../../src/detail";
import type { Item } from "../../src/types";

const [ahold, normaal] = JSON.parse(readFileSync("tests/fixtures/joey/punten-ahold-508.json", "utf8")) as Item[];
const toon = (item: Item) => renderToStaticMarkup(createElement(DetailView, { item, onBack: () => {}, bionic: false, dag: "2026-11-03" }));
assert.doesNotMatch(toon(ahold), /festival over kunst|capaciteit van datacenters/);
console.log("ok - Ahold: punten van andere berichten verdwijnen");
assert.match(toon(normaal), /niet duidelijk hoe de brand is ontstaan/);
console.log("ok - schoorsteenbrand: relevant punt blijft");

import { invoerBijKop, relevantePunten, verzamelUrl } from "../../src/puntenrelevantie";
assert.equal(verzamelUrl(ahold.bronnen[0].href), true);
assert.equal(invoerBijKop("Ahold verliest geld. Delft organiseert een festival.", ahold.bronnen[0].href), "Ahold verliest geld.");
assert.deepEqual(relevantePunten(ahold.punten, ahold.kop, ahold.ai, ahold.samenvatting), []);
assert.deepEqual(relevantePunten(normaal.punten, normaal.kop, normaal.ai, normaal.samenvatting), normaal.punten);
console.log("ok - invoer en punten van het verzamelbericht worden begrensd");

assert.equal(verzamelUrl("https://voorbeeld.nl/nieuws?bron=/kort-iets-en-meer"), false);
assert.equal(verzamelUrl("geen geldige URL"), false);
for (const tekst of ["Ahold Delhaize N.V. verloor geld. Delft organiseert een festival.", "Ahold noemt bijv. een verlies. Delft organiseert een festival.", "Ahold noemt o.a. een verlies. Delft organiseert een festival."]) {
  assert.equal(invoerBijKop(tekst, ahold.bronnen[0].href), tekst.slice(0, tekst.indexOf(". Delft") + 1));
}
console.log("ok - URL-pad en afkortingen begrenzen de invoer correct");

// #1173: titelafkortingen midden in de eerste zin kappen die zin niet af.
const kort = ahold.bronnen[0].href;
assert.equal(invoerBijKop("Dr. Jansen onderzoekt de zaak. Daarna ander nieuws.", kort), "Dr. Jansen onderzoekt de zaak.");
assert.equal(invoerBijKop("Advocaat mr. De Vries pleit voor vrijspraak. Daarna ander nieuws.", kort), "Advocaat mr. De Vries pleit voor vrijspraak.");
assert.equal(invoerBijKop("Prof. dr. ir. Bakker waarschuwt. Delft organiseert een festival.", kort), "Prof. dr. ir. Bakker waarschuwt.");
assert.equal(invoerBijKop("Dr. Jansen onderzoekt de zaak. Daarna ander nieuws.", "https://voorbeeld.nl/nieuws/artikel"), "Dr. Jansen onderzoekt de zaak. Daarna ander nieuws.");
// Worker-invoer (worker/src/index.ts): per clusterlid begrensd, samengevoegd met " // ".
const workerTekst = [["Dr. Jansen onderzoekt de zaak. Daarna ander nieuws.", kort], ["Gewoon artikel. Tweede zin.", "https://voorbeeld.nl/a"]].map(([s, h]) => invoerBijKop(s, h)).join(" // ");
assert.equal(workerTekst, "Dr. Jansen onderzoekt de zaak. // Gewoon artikel. Tweede zin.");
console.log("ok - titelafkortingen kappen de invoer niet af");
