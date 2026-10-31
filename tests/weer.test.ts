import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { buildWeer, KNMI_VERW, OM_URL } from "../worker/src/weer";
import { simpelWeer, isPromptEcho } from "../worker/src/ai";

Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
let n = 0;
const t = async (naam: string, fn: () => Promise<void>) => { await fn(); n++; console.log("✓", naam); };
// ---- landelijk weer (#37): lokale fixtures, geen netwerk, geen echte AI
const st = (stationname: string, regio: string, temperature: number | null, weatherdescription = "Zwaar bewolkt", feeltemperature = temperature) => ({ stationname, regio, temperature, feeltemperature, weatherdescription });
const brFix = {
  actual: { stationmeasurements: [st("Meetstation Schiphol", "Amsterdam", 10), st("Meetstation Eelde", "Groningen", 8, "Mist"), st("Meetstation Maastricht", "Maastricht", 14, "Zwaar bewolkt"), st("Meetstation De Bilt", "Utrecht", 12), st("Zeeplatform F-3", "Noordzee", 25), st("Meetstation Kapot", "Venlo", null)] },
  forecast: { fivedayforecast: [{ day: "2026-10-30T00:00:00", mintemperature: "7", maxtemperature: "13", rainChance: 10, windDirection: "o", wind: 3, weatherdescription: "Zwaar bewolkt" }, { day: "2026-10-31T00:00:00", mintemperature: "6", maxtemperature: "13", weatherdescription: "Zwaar bewolkt" }] },
};
const punt = (t: number, code: number, mn: number, mx: number, kans: number, wind: number, richting: number) => ({ current: { temperature_2m: t, apparent_temperature: t - 1, weather_code: code }, daily: { time: ["2026-10-30", "2026-10-31"], temperature_2m_min: [mn, mn], temperature_2m_max: [mx, mx], precipitation_probability_max: [kans, kans], weather_code: [code, code], wind_speed_10m_max: [wind, wind], wind_direction_10m_dominant: [richting, richting] } });
const omFix = [punt(9, 45, 6, 11, 5, 3, 90), punt(11, 3, 7, 13, 20, 4, 90), punt(14, 1, 9, 15, 40, 9, 180)];
const kvFix = (waarsch: string) => `<h2>Vandaag &amp; morgen</h2><p class="intro">Mist, later zon</p><p><strong><a href="x">Waarschuwingen</a></strong>&nbsp;<br>${waarsch}<br><br><strong>Vanochtend</strong>&nbsp;komt er in vrijwel het hele land mist voor. In het noorden blijft het mistig, in het zuiden schijnt de zon. De maximumtemperatuur van 11&#176;C tot 14&#176;C. (Bron: KNMI)</p>`;
await t("weer: landelijk beeld uit meerdere stations, plaats Nederland, geen Haarlem", async () => {
  const { weer, knmiTekst } = buildWeer(brFix, null, kvFix("Er zijn geen waarschuwingen."), "2026-10-30", "10:00");
  assert.equal(weer.plaats, "Nederland");
  assert.deepEqual(weer.nu, { temp: 11, gevoel: 11, omschrijving: "Bewolkt", van: 8, tot: 14 }, "mediaan van landstations, platform en lege meting genegeerd");
  assert.deepEqual(weer.vandaag, { min: 7, max: 13, neerslagkans: 10, wind: "O 3 Bft" });
  assert.equal(weer.waarschuwing, "");
  assert.ok(weer.verwachting.includes("noorden") && knmiTekst.includes("zuiden"));
  assert.ok(weer.bronnen.some((b: any) => b.site === "KNMI" && b.href === KNMI_VERW));
  assert.ok(!JSON.stringify(weer).includes("Haarlem"));
});
await t("weer: landelijke KNMI-waarschuwing, ergste code wint", async () => {
  assert.equal(buildWeer(null, null, kvFix("Vanochtend plaatselijk dichte mist (code geel)."), "2026-10-30", "10:00").weer.waarschuwing, "Code geel: Vanochtend plaatselijk dichte mist.");
  const w = buildWeer(null, null, kvFix("Vanochtend mist (code geel).<br>Vanmiddag in het noorden storm (code oranje)."), "2026-10-30", "10:00").weer;
  assert.equal(w.waarschuwing, "Code oranje: Vanmiddag in het noorden storm.");
  assert.ok(w.bronnen.some((b: any) => b.site === "KNMI waarschuwingen"));
});
await t("weer: Open-Meteo met meerdere punten geeft noord–zuid-bereik en hoogste kans", async () => {
  assert.equal(new URL(OM_URL).searchParams.get("latitude")!.split(",").length, 3, "één verzoek, drie punten");
  const { weer } = buildWeer(null, omFix, null, "2026-10-30", "10:00");
  assert.deepEqual(weer.nu, { temp: 11, gevoel: 10, omschrijving: "Bewolkt", van: 9, tot: 14 });
  assert.deepEqual(weer.vandaag, { min: 6, max: 15, neerslagkans: 40, wind: "Z 5 Bft" });
  assert.equal(weer.dagen.length, 1);
  assert.equal(weer.waarschuwing, "");
});
await t("weer: ontbrekende bronnen leveren lege velden, geen verzonnen getallen", async () => {
  const { weer } = buildWeer(null, null, null, "2026-10-30", "10:00");
  assert.equal(weer.plaats, "Nederland");
  assert.equal(weer.nu, undefined);
  assert.equal(weer.vandaag, undefined);
  assert.deepEqual(weer.dagen, []);
  assert.equal(weer.verwachting, "");
});
await t("weer: simpelWeer-prompt is landelijk, invoer max 1500 tekens, één aanroep", async () => {
  const gezien: any[] = [];
  const ai: any = { run: async (_m: string, inv: any) => { gezien.push(inv); return { response: "Het wordt droog.", usage: { prompt_tokens: 10, completion_tokens: 5 } }; } };
  await simpelWeer(ai, "m", "x".repeat(5000), { neurons: 0, calls: 0, fails: 0, inTok: 0, outTok: 0 });
  assert.equal(gezien.length, 1);
  const prompt = JSON.stringify(gezien[0]);
  assert.ok(!/Haarlem/i.test(prompt) && /heel Nederland/.test(prompt));
  assert.ok(JSON.stringify(gezien[0].messages.at(-1).content).length < 1900);
});
await t("weer: prompt-echo als modeluitvoer wordt afgewezen (#378)", async () => {
  const echo = "Herschrijf het boekje voor de Nederlandse nieuwssite 'Nieuws in het kort'. Schrijf voor volwassenen in eenvoudig Nederlands (B1): korte zinnen.";
  const ai: any = { run: async () => ({ response: echo, usage: { prompt_tokens: 10, completion_tokens: 5 } }) };
  assert.equal(await simpelWeer(ai, "m", "KNMI-tekst", { neurons: 0, calls: 0, fails: 0, inTok: 0, outTok: 0 }), "");
  assert.ok(isPromptEcho(echo) && isPromptEcho("Schrijf voor volwassenen in eenvoudig Nederlands (B1) en kort."));
  assert.ok(!isPromptEcho("Vandaag is het droog, in het noorden mistig. Morgen wordt het zonnig."));
});

// ---- foutpaden (#172): buildWeer krijgt van de Worker null bij onbereikbare bron, HTTP-fout of ongeldige JSON; hier alleen huidig gedrag vastleggen
const leeg = (r: any) => { assert.equal(r.weer.plaats, "Nederland"); assert.equal(r.weer.nu, undefined); assert.equal(r.weer.vandaag, undefined); assert.deepEqual(r.weer.dagen, []); assert.equal(r.weer.verwachting, ""); assert.equal(r.weer.waarschuwing, ""); assert.deepEqual(r.weer.bronnen, []); assert.equal(r.knmiTekst, ""); };
await t("weer: Buienradar onbereikbaar, Open-Meteo valt terug", async () => {
  const { weer } = buildWeer(null, omFix, kvFix("Er zijn geen waarschuwingen."), "2026-10-30", "10:00");
  assert.equal(weer.nu.temp, 11);
  assert.deepEqual(weer.bronnen.map((b: any) => b.site), ["Open-Meteo", "KNMI"]);
});
await t("weer: Open-Meteo onbereikbaar, Buienradar blijft", async () => {
  const { weer } = buildWeer(brFix, null, null, "2026-10-30", "10:00");
  assert.equal(weer.nu.temp, 11);
  assert.deepEqual(weer.bronnen.map((b: any) => b.site), ["Buienradar"]);
  assert.equal(weer.dagen.length, 1);
});
await t("weer: KNMI onbereikbaar of lege pagina: verwachting valt terug op Buienradar-weerbericht", async () => {
  const br = { ...brFix, forecast: { ...brFix.forecast, weatherreport: { summary: "<p>Droog en zonnig. Later bewolkt. Morgen regen. Overmorgen koud.</p>" } } };
  for (const kv of [null, "", "<html>Onderhoud</html>"]) {
    const r = buildWeer(br, null, kv, "2026-10-30", "10:00");
    assert.equal(r.weer.verwachting, "Droog en zonnig. Later bewolkt. Morgen regen.");
    assert.ok(r.knmiTekst.includes("Overmorgen"));
    assert.ok(!r.weer.bronnen.some((b: any) => b.site.startsWith("KNMI")));
    assert.equal(r.weer.waarschuwing, "");
  }
});
await t("weer: alle bronnen weg, ongeldige of niet-objectwaarden geven een leeg weerbericht", async () => {
  leeg(buildWeer(null, null, null, "2026-10-30", "10:00"));
  leeg(buildWeer(null, [], null, "2026-10-30", "10:00"));
  leeg(buildWeer({}, {}, "", "2026-10-30", "10:00"));
  leeg(buildWeer(undefined, [null, 5, "x"], null, "2026-10-30", "10:00"));
});
await t("weer: HTTP-foutbody (JSON zonder verwachte velden) levert geen getallen", async () => {
  leeg(buildWeer({ error: "rate limited" }, { error: true, reason: "Too many requests" }, null, "2026-10-30", "10:00"));
  leeg(buildWeer({ actual: {}, forecast: {} }, { current: {}, daily: {} }, null, "2026-10-30", "10:00"));
  leeg(buildWeer({ actual: { stationmeasurements: [] }, forecast: { fivedayforecast: [] } }, null, null, "2026-10-30", "10:00"));
});
await t("weer: ontbrekende of niet-numerieke velden worden overgeslagen", async () => {
  const br = { actual: { stationmeasurements: [st("A", "Utrecht", "x" as any), st("B", "Utrecht", 9, "Mist", null as any), { stationname: "C", regio: "Utrecht" }] } };
  const { weer } = buildWeer(br, null, null, "2026-10-30", "10:00");
  assert.deepEqual(weer.nu, { temp: 9, omschrijving: "Mist" }, "geen gevoel, geen bereik bij één geldig station");
  const om = [{ current: { temperature_2m: "NaN", apparent_temperature: null, weather_code: 999 }, daily: { time: ["2026-10-30"], temperature_2m_min: [null], temperature_2m_max: ["x"] } }];
  const r = buildWeer(null, om, null, "2026-10-30", "10:00");
  assert.equal(r.weer.nu, undefined, "onbekende weercode en ongeldige temperatuur");
  assert.equal(r.weer.vandaag, undefined);
  assert.deepEqual(r.weer.dagen, []);
});
await t("weer: dagen zonder min en max worden niet getoond", async () => {
  const br = { forecast: { fivedayforecast: [{ day: "2026-10-31T00:00:00", weatherdescription: "Regen" }, { day: "2026-11-01T00:00:00", mintemperature: "3", maxtemperature: "8", weatherdescription: "Regen" }] } };
  const { weer } = buildWeer(br, null, null, "2026-10-30", "10:00");
  assert.deepEqual(weer.dagen, [{ dag: "zo", min: 3, max: 8, omschrijving: "Regen" }]);
});

console.log(`\n${n} weer-tests geslaagd`);
