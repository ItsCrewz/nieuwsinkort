// Draai: npm run test  (randgevallen buildWeer() en kort(), worker/src/weer.ts; issue #225). Legt huidig gedrag vast, inline fixtures zonder netwerk.
import assert from "node:assert/strict";
import { buildWeer, kort } from "../worker/src/weer";

let n = 0;
const t = (naam: string, fn: () => void) => { fn(); n++; console.log("✓", naam); };
const VAN = "2026-10-30";
const st = (temperature: any, weatherdescription?: string, feeltemperature: any = temperature, regio = "Utrecht") => ({ stationname: "S", regio, temperature, feeltemperature, weatherdescription });
const kvFix = (inhoud: string) => `<h2>Vandaag &amp; morgen</h2><p>${inhoud} (Bron: KNMI)</p>`;

t("kort: lange omschrijving met bekend sleutelwoord wordt de korte vorm", () => {
  assert.equal(kort("Zwaar bewolkt met af en toe een bui en later onweer in het zuiden van het land"), "Onweer", "eerste regel in de lijst wint, niet de volgorde in de tekst");
  assert.equal(kort("ZWAAR BEWOLKT"), "Bewolkt", "hoofdletterongevoelig");
  assert.equal(kort("Regen"), "Regen");
  assert.equal(kort("Lichte bui"), "Buien");
  assert.equal(kort("Opklaringen en later zonnig"), "Half bewolkt", "opklaring staat vóór zonnig");
});
t("kort: onbekende, lege en ontbrekende omschrijving", () => {
  const lang = "x".repeat(300);
  assert.equal(kort(lang), lang, "onbekende tekst blijft ongeknipt");
  assert.equal(kort("  Stormachtig  "), "Stormachtig", "alleen getrimd");
  assert.equal(kort(""), "");
  assert.equal(kort(undefined), "");
  assert.equal(kort("   "), "");
});
t("buildWeer: hhmm komt ongewijzigd als bijgewerkt terug, ook rond middernacht", () => {
  for (const h of ["00:00", "00:01", "23:59", "09:05"]) assert.equal(buildWeer(null, null, null, VAN, h).weer.bijgewerkt, h);
});
t("buildWeer: de dag na middernacht schuift vandaag en dagen mee", () => {
  const br = { forecast: { fivedayforecast: [VAN, "2026-10-31", "2026-11-01", "2026-11-02", "2026-11-03"].map((d, i) => ({ day: d + "T00:00:00", mintemperature: String(i), maxtemperature: String(i + 5), weatherdescription: "Regen" })) } };
  const a = buildWeer(br, null, null, VAN, "23:59").weer;
  assert.deepEqual(a.vandaag, { min: 0, max: 5 });
  assert.deepEqual(a.dagen.map((d: any) => d.dag), ["za", "zo", "ma"], "maximaal drie dagen na vandaag");
  const b = buildWeer(br, null, null, "2026-10-31", "00:00").weer;
  assert.deepEqual(b.vandaag, { min: 1, max: 6 });
  assert.deepEqual(b.dagen.map((d: any) => d.dag), ["zo", "ma", "di"]);
  assert.equal(b.bijgewerkt, "00:00");
  const c = buildWeer(br, null, null, "2026-11-04", "00:01").weer;
  assert.equal(c.vandaag, undefined, "vandaag buiten de voorspelling");
  assert.deepEqual(c.dagen, []);
});
t("buildWeer: kv null versus gevuld", () => {
  const br = { forecast: { weatherreport: { summary: "Buienradar-tekst." } } };
  const zonder = buildWeer(br, null, null, VAN, "10:00");
  assert.equal(zonder.weer.verwachting, "Buienradar-tekst.");
  assert.ok(!zonder.weer.bronnen.some((b: any) => b.site === "KNMI"));
  const met = buildWeer(br, null, kvFix("Droog en zonnig. Later wolken."), VAN, "10:00");
  assert.equal(met.weer.verwachting, "Droog en zonnig. Later wolken.", "KNMI gaat voor Buienradar");
  assert.equal(met.knmiTekst, "Droog en zonnig. Later wolken.");
  assert.deepEqual(met.weer.bronnen.map((b: any) => b.site), ["KNMI"]);
});
t("buildWeer: kv zonder KNMI-blok of zonder (Bron: KNMI)-afsluiting geeft niets", () => {
  for (const kv of ["", "geen html", "<h2>Vandaag &amp; morgen</h2><p>Zonder bronregel.</p>", "<h2>Gisteren</h2><p>Droog. (Bron: KNMI)</p>"]) {
    const r = buildWeer(null, null, kv, VAN, "10:00");
    assert.equal(r.weer.verwachting, "");
    assert.equal(r.knmiTekst, "");
    assert.equal(r.weer.bronnen.length, 0);
  }
});
t("buildWeer: verwachting is hooguit drie zinnen, knmiTekst volledig", () => {
  const r = buildWeer(null, null, kvFix("Een. Twee! Drie? Vier. Vijf."), VAN, "10:00");
  assert.equal(r.weer.verwachting, "Een. Twee! Drie?");
  assert.equal(r.knmiTekst, "Een. Twee! Drie? Vier. Vijf.");
});
t("buildWeer: Buienradar met lege of ontbrekende velden", () => {
  const leegSt = { actual: { stationmeasurements: [st(undefined, "Mist"), st(null, "Mist")] } };
  assert.equal(buildWeer(leegSt, null, null, VAN, "10:00").weer.nu, undefined, "undefined en null tellen niet als meting");
  assert.equal(buildWeer({ actual: { stationmeasurements: [st("", "Mist")] } }, null, null, VAN, "10:00").weer.nu.temp, 0, "huidig gedrag: lege string telt als 0 graden");
  const geenOms = buildWeer({ actual: { stationmeasurements: [st(10), st(12, "")] } }, null, null, VAN, "10:00").weer;
  assert.deepEqual(geenOms.nu, { temp: 11, gevoel: 11, van: 10, tot: 12 }, "zonder omschrijving geen omschrijving");
  const nul = buildWeer({ actual: { stationmeasurements: [st(0, "Mist", 0)] } }, null, null, VAN, "10:00").weer;
  assert.deepEqual(nul.nu, { temp: 0, gevoel: 0, omschrijving: "Mist" }, "0 graden is een geldige meting");
  const nz = buildWeer({ actual: { stationmeasurements: [st(25, "Zon", 25, "Noordzee")] } }, null, null, VAN, "10:00").weer;
  assert.equal(nz.nu, undefined, "alleen Noordzee-platforms");
  assert.equal(nz.bronnen.length, 0);
});
t("buildWeer: Buienradar-dag zonder wind, regenkans of richting", () => {
  const dag = (extra: any) => ({ forecast: { fivedayforecast: [{ day: VAN + "T00:00:00", mintemperature: "-2", maxtemperature: "4", ...extra }] } });
  assert.deepEqual(buildWeer(dag({}), null, null, VAN, "10:00").weer.vandaag, { min: -2, max: 4 });
  assert.deepEqual(buildWeer(dag({ wind: 4 }), null, null, VAN, "10:00").weer.vandaag, { min: -2, max: 4 }, "wind zonder richting wordt weggelaten");
  assert.deepEqual(buildWeer(dag({ wind: 4, windDirection: "zw", rainChance: 0 }), null, null, VAN, "10:00").weer.vandaag, { min: -2, max: 4, neerslagkans: 0, wind: "ZW 4 Bft" }, "kans 0 blijft staan");
  assert.deepEqual(buildWeer(dag({ mintemperatureMin: "-5", maxtemperatureMax: "6" }), null, null, VAN, "10:00").weer.vandaag, { min: -5, max: 6 }, "MinMax-velden gaan voor");
});
t("buildWeer: Open-Meteo vult alleen aan wat Buienradar mist", () => {
  const br = { forecast: { fivedayforecast: [{ day: VAN + "T00:00:00", mintemperature: "7", maxtemperature: "13" }] } };
  const om = { daily: { time: [VAN], temperature_2m_min: [1], temperature_2m_max: [2], precipitation_probability_max: [55], wind_speed_10m_max: [9], wind_direction_10m_dominant: [270], weather_code: [3] } };
  const w = buildWeer(br, om, null, VAN, "10:00").weer;
  assert.deepEqual(w.vandaag, { min: 7, max: 13, neerslagkans: 55, wind: "W 5 Bft" });
  assert.deepEqual(w.bronnen.map((b: any) => b.site), ["Open-Meteo"]);
});
t("buildWeer: Open-Meteo met één object, ontbrekende daily-reeksen en code 0", () => {
  const om = { current: { temperature_2m: 5, weather_code: 0 }, daily: { time: [VAN, "2026-10-31"], temperature_2m_min: [1, 2], temperature_2m_max: [4, 6], weather_code: [0, 61] } };
  const w = buildWeer(null, om, null, VAN, "10:00").weer;
  assert.deepEqual(w.nu, { temp: 5, omschrijving: "Zonnig" }, "geen gevoel, geen bereik bij één punt");
  assert.deepEqual(w.vandaag, { min: 1, max: 4 }, "zonder kans en wind");
  assert.deepEqual(w.dagen, [{ dag: "za", min: 2, max: 6, omschrijving: "Lichte regen" }]);
});
t("buildWeer: dag met onbekende weercode krijgt lege omschrijving die wegvalt", () => {
  const om = { daily: { time: [VAN, "2026-10-31"], temperature_2m_min: [1, 2], temperature_2m_max: [4, 6], weather_code: [0, 123] } };
  assert.deepEqual(buildWeer(null, om, null, VAN, "10:00").weer.dagen, [{ dag: "za", min: 2, max: 6 }]);
});

console.log(`\n${n} weer-randgevallen-tests geslaagd`);
