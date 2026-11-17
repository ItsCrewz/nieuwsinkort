import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server.browser";
import { KIND_CLASS, WarnBanner, WeatherBox, weatherKind } from "../src/app-weer";
import type { Weer } from "../src/types";

for (const [tekst, verwacht] of [
  ["HALF bewolkt met regen", "partly"], ["wisselend", "partly"], ["af en toe zon", "partly"],
  ["onweer en zon", "rain"], ["sneeuw", "rain"], ["helder", "sun"], ["onbewolkt", "sun"],
  ["bewolkt", "cloud"], ["", "cloud"],
] as const) assert.equal(weatherKind(tekst), verwacht);
assert.equal(weatherKind(), "cloud");
assert.deepEqual(KIND_CLASS, { sun: "ic-sun", rain: "ic-rain", partly: "ic-partly", cloud: "" });

const waarschuwing = (text: string) => renderToStaticMarkup(createElement(WarnBanner, { text }));
assert.match(waarschuwing("Code ROOD. Blijf binnen"), /class="alert lvl-rood" role="status"/);
assert.match(waarschuwing("Code ROOD. Blijf binnen"), /<strong>Code ROOD\.<\/strong> Blijf binnen/);
assert.match(waarschuwing("Code oranje: Pas op"), /class="alert lvl-oranje"/);
assert.match(waarschuwing("Code oranje en rood"), /lvl-rood/);
assert.match(waarschuwing("Let op"), /<strong>Let op<\/strong>/);
assert.match(waarschuwing(`${"a".repeat(81)}. Verder`), /<strong>a{81}\. Verder<\/strong>/);

const origineelNu = Date.now;
Date.now = () => Date.UTC(2026, 10, 15, 12);
try {
  const toon = (W?: Weer, bionic = false) => renderToStaticMarkup(createElement(WeatherBox, { W, bionic }));
  const leeg = toon();
  assert.match(leeg, /aria-label="Weer in heel Nederland"/);
  assert.match(leeg, /Het weerbericht is er nu even niet/);
  assert.doesNotMatch(leeg, /wx-now|wx-stats|wx-days/);

  const weer: Weer = {
    plaats: "Haarlem", bijgewerkt: "12:00", verwachting: "Een zonnige dag", waarschuwing: "Code oranje: Pas op",
    nu: { temp: 0, gevoel: -2, omschrijving: "Regen", van: 1, tot: 5 },
    vandaag: { min: 0, neerslagkans: 0, wind: "ZW 3" },
    dagen: [
      { dag: "maandag", min: 1, max: 8, omschrijving: "Zonnig" },
      { dag: "dinsdag", min: 2, max: 9 },
      { dag: "woensdag", min: 3, max: 10 },
      { dag: "donderdag", min: 4, max: 11 },
      { dag: "vrijdag", min: 5, max: 12 },
    ],
    bronnen: [{ site: "KNMI", href: "https://example.com/weer" }, { site: "Ongeldig", href: "javascript:alert(1)" }],
  };
  const html = toon(weer);
  assert.match(html, /aria-label="Weer in Haarlem"/);
  assert.match(html, /Weer · Haarlem/);
  assert.match(html, /12:00/);
  assert.match(html, /lvl-oranje/);
  assert.match(html, /0°/);
  assert.match(html, /voelt als -2°/);
  assert.match(html, /wx-icon ic-rain/);
  assert.match(html, /Een zonnige dag/);
  assert.match(html, /Nu in het land<\/dt><dd class="tnum">1° tot 5°/);
  assert.match(html, /Vandaag<\/dt><dd class="tnum">0° \/ –/);
  assert.match(html, /Neerslag<\/dt><dd class="tnum">0%/);
  assert.match(html, /Wind<\/dt><dd class="tnum">ZW 3/);
  assert.match(html, /repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(html, /16 nov/);
  assert.equal((html.match(/class="day"/g) || []).length, 4);
  assert.doesNotMatch(html, /Vrijdag/);
  assert.match(html, /title="Bewolkt"/);
  assert.match(html, /href="https:\/\/example\.com\/weer" target="_blank" rel="noreferrer"/);
  assert.doesNotMatch(html, /href="javascript:/);
  assert.match(toon(weer, true), /<b>/);

  const gelijk = toon({ ...weer, nu: { van: 3, tot: 3 }, vandaag: {}, verwachting: "", waarschuwing: "", dagen: [], bronnen: [] });
  assert.match(gelijk, /Het weerbericht is er nu even niet/);
  assert.doesNotMatch(gelijk, /Nu in het land|wx-src/);
  const alleenWaarschuwing = toon({ ...weer, nu: {}, vandaag: {}, verwachting: "", dagen: [], bronnen: [] });
  assert.doesNotMatch(alleenWaarschuwing, /Het weerbericht is er nu even niet/);
} finally {
  Date.now = origineelNu;
}
