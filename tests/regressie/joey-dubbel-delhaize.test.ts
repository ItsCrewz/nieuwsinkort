// Regressie (Joey 02-11, #488): "Staat dit niet een beetje dubbel?" Delhaize/Carrefour-item (Tweakers 254034): Uitgebreid herhaalde alleen intro + samenvatting
// en de puntenlijst had een punt dat al in de tekst stond. Echte itemdata: tests/fixtures/joey/delhaize.json.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server.browser";
import { DetailView } from "../../src/detail";
import type { Item } from "../../src/types";

const fx = JSON.parse(readFileSync("tests/fixtures/joey/delhaize.json", "utf8")) as { item: Item; puntenDubbel: Item };
const html = (item: Item) => renderToStaticMarkup(createElement(DetailView, { item, onBack: () => {}, bionic: false }));
const t = (naam: string, f: () => void | Promise<void>) => Promise.resolve(f()).then(() => console.log("ok -", naam));

await t("Delhaize-item zonder /meer: geen Uitgebreid dat intro+samenvatting herhaalt, wel intro, samenvatting en bronnen", () => {
  const h = html(fx.item);
  assert.ok(!h.includes('aria-label="Uitgebreid"'), "sectie Uitgebreid herhaalt alleen intro en samenvatting");
  assert.ok(h.includes("Aanvallers hackten maandagochtend"), "intro blijft");
  assert.ok(h.includes("zeker 40 winkels van Delhaize"), "samenvatting blijft");
  assert.ok(h.includes('aria-label="Bronnen"') && h.includes("tweakers.net/nieuws/254034"), "bronlink blijft");
});

await t("één nieuw punt blijft zichtbaar; twijfelgevallen blijven behouden", () => {
  assert.equal(fx.item.punten.length, 1);
  assert.ok(html(fx.item).includes('aria-label="Belangrijkste punten"'), "ook één nieuw punt blijft zichtbaar");
  const ajax = fx.puntenDubbel;
  assert.equal(ajax.punten.length, 2);
  assert.ok(html(ajax).includes('aria-label="Belangrijkste punten"'), "afwijkende formuleringen blijven bij twijfel behouden");
});

const { nieuwePunten } = await import("../../src/dubbel");
const { uitgebreidOntdubbeld } = await import("../../src/uitgebreid");

await t("twee echt nieuwe punten blijven staan", () => {
  const item = { ...fx.item, punten: ["Delhaize is het moederbedrijf van Albert Heijn", "De politie onderzoekt de aanval"] };
  assert.deepEqual(nieuwePunten(item.punten, item.ai, item.samenvatting), item.punten);
  assert.ok(html(item).includes('aria-label="Belangrijkste punten"'));
});

await t("AI-uitleg die alleen intro+samenvatting herhaalt: sectie weg; nieuwe zinnen blijven, herhaalde vallen weg", () => {
  const { ai, samenvatting } = fx.item;
  assert.deepEqual(uitgebreidOntdubbeld(fx.item, { uitleg: [`${ai} ${samenvatting}`, samenvatting] }).uitgebreid, []);
  const mix = uitgebreidOntdubbeld(fx.item, { uitleg: [`${samenvatting} Delhaize zette koelwagens in om bederf te voorkomen. De politie onderzoekt wie achter de aanval zit.`] }).uitgebreid;
  assert.equal(mix.length, 1);
  assert.ok(mix[0].includes("koelwagens") && !mix[0].includes("zeker 40 winkels"));
});

await t("tijd en ontkenning blijven behouden in punten en zinnen", () => {
  const paren = [
    ["De winkel verkoopt de telefoon.", "De winkel verkoopt de telefoon morgen."],
    ["De politie heeft de verdachte aangehouden.", "De politie heeft de verdachte niet aangehouden."],
    ["De politie heeft de verdachte niet aangehouden.", "De politie heeft de verdachte aangehouden."],
  ];
  for (const [bron, nieuw] of paren) {
    assert.deepEqual(nieuwePunten([nieuw], bron, ""), [nieuw]);
    assert.deepEqual(uitgebreidOntdubbeld({ ...fx.item, ai: bron, samenvatting: "", punten: [] }, { uitleg: [nieuw] }).uitgebreid, [nieuw]);
  }
});

await t("DetailView toont ook een tegenaanval met omgekeerde rollen", () => {
  const item = { ...fx.item, ai: "Israël valt Iran aan.", samenvatting: "", punten: ["Iran valt Israël aan."] };
  const h = html(item);
  assert.ok(h.includes("Israël valt Iran aan."));
  assert.ok(h.includes("Iran valt Israël aan."));
  assert.ok(h.includes('aria-label="Belangrijkste punten"'));
});
