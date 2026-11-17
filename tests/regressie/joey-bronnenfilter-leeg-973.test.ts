import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server.browser";
import { LeegMelding } from "../../src/leegmelding";
import { buildSources, filterArtikelBronnen, sourceKey } from "../../src/sources";
import type { Data, Item } from "../../src/types";

// Een werkelijk samengevoegd bericht met meerdere bronnen.
const fixture = JSON.parse(readFileSync("tests/fixtures/joey/ruw-dubbel-499.json", "utf8"));
const item: Item = (Array.isArray(fixture) ? fixture : [fixture]).find((x: Item) => x.bronnen?.length >= 2);
const data = { items: [item], filmpjes: [], dumpert: [] } as unknown as Data;
const { index } = buildSources(null, data);
const groep = item.cat === "buitenland" || item.cat === "sport" ? "nl" : item.cat;
const off = new Set(item.bronnen.map((bron) => sourceKey(index, groep, bron.site, bron.href)));
assert.equal(filterArtikelBronnen(item, index, off), null);
const melding = renderToStaticMarkup(createElement(LeegMelding, {
  aantal: 0, ruwAantal: data.items.length, onAanpassen: () => {}, onReset: () => {}, onBronnen: () => {}, onBronnenReset: () => {},
}));
assert.match(melding, /verborgen door uitgeschakelde bronnen/);
assert.match(melding, /<button[^>]*>Bronnen aanpassen<\/button>/);
assert.match(melding, /<button[^>]*>Alle bronnen inschakelen<\/button>/);
assert.doesNotMatch(melding, /Nog geen berichten|Geen berichten met deze filters/);
assert.ok(filterArtikelBronnen(item, index, new Set()));
console.log("bronnenfilter lege rubriek: regressie geslaagd");
