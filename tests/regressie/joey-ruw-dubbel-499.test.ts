import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server.browser";
import { DetailView } from "../../src/detail";
import type { Item } from "../../src/types";

const items = JSON.parse(readFileSync("tests/fixtures/joey/ruw-dubbel-499.json", "utf8")) as Item[];
const html = (item: Item) => renderToStaticMarkup(createElement(DetailView, { item, onBack: () => {}, bionic: false, dag: "2026-11-03" }));
const escaped = (s: string) => renderToStaticMarkup(createElement("span", null, s)).slice(6, -7);
for (const item of items.slice(0, 7)) {
  test(`ruw: ${item.kop}`, () => {
    const h = html(item);
    const tekst = item.ai && item.ai !== "null" ? item.ai : item.kop;
    const blokken = (h.match(/<(?:h1|p)\b[^>]*>.*?<\/(?:h1|p)>/g) || []).join("");
    assert.equal(blokken.split(escaped(tekst)).length - 1, 1, "tekst staat eenmaal in het artikel");
    assert.ok(h.includes("nog niet samengevat"));
    assert.ok(h.includes('aria-label="Bronnen"') && h.includes(escaped(item.bronnen[0].href)));
  });
}
test("samengevatte controles behouden intro en body", () => {
  for (const item of items.slice(7)) {
    const h = html(item);
    assert.ok(h.includes(escaped(item.ai)) && h.includes(escaped(item.samenvatting)));
  }
});
test("betekenisvolle toevoegingen en getaltekens blijven zichtbaar", () => {
  for (const [kop, tekst] of [["Minister treedt af.", "(Onbevestigd) Minister treedt af."], ["Temperatuur is 5 graden.", "Temperatuur is -5 graden."], ["Temperatuur is 5 graden.", "Temperatuur is −5 graden."], ["Aandeel kost £5.", "Aandeel kost ¥5."]]) {
    const h = html({ ...items[3], kop, ai: tekst, samenvatting: tekst });
    assert.ok(h.includes(escaped(kop)) && h.includes(escaped(tekst)));
  }
});
test("symbolen en Unicode-streepjes behouden betekenis in ruwe tekst", () => {
  for (const teken of ["−", "£", "¥", "€", "$", "©", "™", "∞", "→", "😀", "-", "‐", "–", "—", "%", "#", "@", "&", "/", "+", "*"]) {
    const kop = "Waarde is 5.";
    const tekst = `Waarde is ${teken}5.`;
    const h = html({ ...items[3], kop, ai: tekst, samenvatting: tekst });
    assert.ok(h.includes(escaped(kop)) && h.includes(escaped(tekst)), `teken ${teken} blijft zichtbaar`);
  }
});
test("lege ruwe tekstwaarden verschijnen niet", () => {
  for (const waarde of ["null", "undefined", null]) {
    const h = html({ ...items[6], ai: waarde, samenvatting: waarde } as unknown as Item);
    assert.ok(!/>\s*(?:null|undefined)\s*</i.test(h));
    assert.ok(h.includes(escaped(items[6].kop)) && h.includes("nog niet samengevat"));
  }
});
test("normalisatie en betekenisvolle verschillen bij ruwe tekst", () => {
  const basis = items[3];
  const h = html({ ...basis, kop: "Een andere kop", ai: "(Engels) Hallo, WERELD!", samenvatting: "hallo wereld" });
  assert.ok(h.includes("(Engels) Hallo, WERELD!") && !h.includes(">hallo wereld<"));
  const verschillend = html({ ...basis, kop: "Een andere kop", ai: "De zaak is beslist.", samenvatting: "De zaak is niet beslist." });
  assert.ok(verschillend.includes("De zaak is beslist.") && verschillend.includes("De zaak is niet beslist."));
});
