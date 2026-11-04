import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server.browser";
import { DetailView } from "../../src/detail";
import type { Item } from "../../src/types";

const [ahold, normaal] = JSON.parse(readFileSync("tests/fixtures/joey/punten-ahold-508.json", "utf8")) as Item[];
const toon = (item: Item) => renderToStaticMarkup(createElement(DetailView, { item, onBack: () => {}, bionic: false }));
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
