import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { filterNieuws, samengevoegd, sites, STANDAARD } from "../../src/filters";
import type { Item } from "../../src/types";

// Twee bestaande berichten van dezelfde uitgever, met verschillende links.
const fixture = JSON.parse(readFileSync("tests/fixtures/joey/dubbel-509.json", "utf8")) as { feyenoord: Item[] };
const dubbel: Item = { ...fixture.feyenoord[0], bronnen: fixture.feyenoord.flatMap((it) => it.bronnen) };
const varianten: Item = { ...dubbel, kop: "Varianten", bronnen: [{ site: "NU.nl", href: "https://nu.nl/1" }, { site: "nu.nl Voetbal", href: "https://nu.nl/2" }] };
const twee: Item = { ...dubbel, kop: "Twee bronnen", bronnen: [...dubbel.bronnen, { site: "NOS", href: "https://nos.nl/1" }] };
const drie: Item = { ...twee, kop: "Drie bronnen", bronnen: [...twee.bronnen, { site: "RTL Nieuws", href: "https://rtl.nl/1" }] };
const leeg: Item = { ...dubbel, kop: "Zonder bronnen", bronnen: [] };

assert.equal(sites(dubbel), 1);
assert.equal(sites(varianten), 1);
assert.equal(sites(twee), 2);
assert.equal(sites(drie), 3);
assert.equal(sites(leeg), 0);
assert.equal(samengevoegd(dubbel), false);
assert.equal(samengevoegd(varianten), false);
assert.equal(samengevoegd(twee), true);
assert.equal(samengevoegd(leeg), false);
const uit = filterNieuws([dubbel, twee, varianten, drie, leeg], { ...STANDAARD, tijd: "alles", samen: true, sort: "bronnen" }, 0, undefined, true);
assert.deepEqual(uit.items.map((it) => it.kop), ["Drie bronnen", "Twee bronnen"]);
assert.equal(uit.per.alles, 2);
assert.ok(filterNieuws([leeg], { ...STANDAARD, tijd: "alles" }, 0, undefined, true).items.includes(leeg));
console.log("✓ unieke bronnen bepalen filter, telling en sortering (#701)");
