import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { valideer } from "../../src/valideer";

// Bestaande data.json als fixture: de nieuwsberichten moeten beschikbaar blijven.
const data = JSON.parse(readFileSync("public/data.json", "utf8"));
const lees = (weer: unknown) => valideer({ ...data, weer }).data;
const volledig = { plaats: "Nederland", bijgewerkt: "10:00", nu: { temp: 12, omschrijving: "Zon" }, vandaag: { min: 5, max: 14, wind: "ZW" }, verwachting: "Droog", waarschuwing: "", dagen: [{ dag: "ma", min: 5, max: 14, omschrijving: "Zon" }], bronnen: [{ site: "KNMI", href: "https://knmi.nl" }] };
assert.deepEqual(lees(volledig).weer, volledig);
assert.deepEqual(lees({}).weer, {});
for (const waarde of ["geen lijst", 42, null, {}]) {
  const uit = lees({ dagen: waarde, bronnen: waarde });
  assert.deepEqual(uit.weer.dagen, []);
  assert.deepEqual(uit.weer.bronnen, []);
  assert.deepEqual(uit.items, data.items);
}
const deels = lees({ ...volledig, plaats: {}, bijgewerkt: 4, verwachting: [], waarschuwing: 7, nu: { temp: 12, omschrijving: 42, gevoel: "12" }, vandaag: { min: 5, max: null, wind: {} }, dagen: [null, "ma", { dag: 1, max: 10 }, { dag: "di", min: 3, max: "10", omschrijving: 42 }, volledig.dagen[0]], bronnen: [null, { site: 1, href: "https://knmi.nl" }, volledig.bronnen[0]] });
assert.deepEqual(deels.items, data.items);
assert.deepEqual(deels.weer, { nu: { temp: 12 }, vandaag: { min: 5 }, dagen: [{ dag: "di", min: 3 }, volledig.dagen[0]], bronnen: volledig.bronnen });
console.log("✓ ongeldige weerdata houdt nieuws beschikbaar (#801)");
