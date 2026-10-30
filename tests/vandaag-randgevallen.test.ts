import assert from "node:assert/strict";
import { TOEKOMST_MARGE, TZ_MARGE, alleenVandaag, nieuwsteTijd, publicatieTijd, vanVandaag } from "../src/vandaag";
import { midnight } from "../src/tijd";

const now = Date.parse("2026-10-30T10:00:00+01:00");
const vandaag0 = midnight(now);
const gisteren = Date.parse("2026-10-29T23:59:59.999+01:00");

assert.equal(TOEKOMST_MARGE, 15 * 60e3);
assert.equal(TZ_MARGE, 2 * 3600e3 + 15 * 60e3);

// Toekomstmarge: tot en met 15 minuten blijft de eigen tijd staan, daarna wordt het nu.
assert.equal(publicatieTijd(now + TOEKOMST_MARGE - 1, now), now + TOEKOMST_MARGE - 1, "net binnen de marge");
assert.equal(publicatieTijd(now + TOEKOMST_MARGE, now), now + TOEKOMST_MARGE, "precies op de marge");
assert.equal(publicatieTijd(now + TOEKOMST_MARGE + 1, now), now, "net buiten de marge wordt nu");
assert.equal(publicatieTijd(now, now), now);
assert.equal(publicatieTijd(now - 86400e3, now), now - 86400e3, "verleden blijft ongemoeid");
console.log("✓ toekomstmarge van 15 minuten");

// Klemmen: tot en met 2 u 15 min vooruit wordt nu, daarna valt het bericht af.
assert.equal(publicatieTijd(now + TZ_MARGE - 1, now), now);
assert.equal(publicatieTijd(now + TZ_MARGE, now), now, "precies 2 u 15 min wordt geklemd");
assert.equal(publicatieTijd(now + TZ_MARGE + 1, now), null, "verder vooruit valt af");
assert.equal(vanVandaag(now + TZ_MARGE, now), true);
assert.equal(vanVandaag(now + TZ_MARGE + 1, now), false);
console.log("✓ klemmen tot 2 u 15 min vooruit");

// Geklemd naar nu telt als vandaag, ook als de eigen tijd al morgen is.
const laat = Date.parse("2026-10-30T23:50:00+01:00");
const morgen = Date.parse("2026-10-31T00:30:00+01:00");
assert.equal(publicatieTijd(morgen, laat), laat);
assert.equal(vanVandaag(morgen, laat), true);
const vroeg = Date.parse("2026-10-31T00:05:00+01:00");
assert.equal(vanVandaag(Date.parse("2026-10-30T23:59:00+01:00"), vroeg), false, "gisteren blijft gisteren na middernacht");
console.log("✓ klemmen rond middernacht");

// Ontbrekende of ongeldige datum valt af.
for (const d of [null, undefined, NaN, Infinity, -Infinity]) {
  assert.equal(publicatieTijd(d, now), null, String(d));
  assert.equal(vanVandaag(d, now), false, String(d));
}
console.log("✓ ontbrekende datum valt af");

// Cluster: t is de tijd van het nieuwste lid, ongeacht de volgorde.
assert.equal(nieuwsteTijd([{ d: gisteren }, { d: now - 60e3 }, { d: vandaag0 }]), now - 60e3);
assert.equal(nieuwsteTijd([{ d: now - 60e3 }, { d: gisteren }]), now - 60e3);
assert.equal(nieuwsteTijd([{ d: gisteren }]), gisteren);
assert.equal(nieuwsteTijd([{ d: now }, { d: now }]), now);
assert.equal(vanVandaag(nieuwsteTijd([{ d: gisteren }, { d: vandaag0 }]), now), true, "één lid van vandaag maakt het cluster van vandaag");
assert.equal(vanVandaag(nieuwsteTijd([{ d: gisteren }, { d: gisteren - 3600e3 }]), now), false);
assert.equal(nieuwsteTijd([]), -Infinity);
assert.equal(vanVandaag(nieuwsteTijd([]), now), false, "leeg cluster valt af");
console.log("✓ cluster gebruikt het nieuwste lid");

// alleenVandaag: items met t.
const gen = new Date(Date.parse("2026-10-30T09:40:00+01:00")).toISOString();
const items = [
  { id: "marge", t: now + TZ_MARGE },
  { id: "te-ver", t: now + TZ_MARGE + 1 },
  { id: "null", t: null },
  { id: "undefined", t: undefined },
  { id: "middernacht", t: vandaag0 },
  { id: "gisteren", t: vandaag0 - 1 },
];
const r = alleenVandaag({ gegenereerd: gen, dag_samenvatting: "x", items, filmpjes: [], dumpert: [] }, now);
assert.deepEqual(r.items.map((x: any) => x.id), ["marge", "middernacht"]);
assert.equal(r.items[0].t, now + TZ_MARGE, "t wordt niet herschreven");
assert.deepEqual(r.oud, { items: 4, filmpjes: 0, dumpert: 0 });
assert.equal(r.dag_samenvatting, "x");
console.log("✓ alleenVandaag met t en ontbrekende datum");

// alleenVandaag zonder t: tijd tot en met gegenereerd + 20 minuten.
const metTijd = alleenVandaag({ gegenereerd: gen, items: [{ tijd: "10:00" }, { tijd: "10:01" }, { tijd: "9:00" }, { tijd: "24:00" }, { tijd: "09:60" }, {}, null, { tijd: "00:00" }] }, now);
assert.deepEqual(metTijd.items, [{ tijd: "10:00" }, { tijd: "00:00" }]);
assert.equal(metTijd.oud.items, 6);
console.log("✓ alleenVandaag met hh:mm-tijd");

// Dumpert: alleen vandaag, met dezelfde toekomstregels.
const dumpert = [
  { href: "a", t: now - 3600e3 },
  { href: "b", t: gisteren },
  { href: "c", t: now + TOEKOMST_MARGE + 1 },
  { href: "d", t: now + TZ_MARGE + 1 },
  { href: "e", tijd: "09:30" },
  { href: "f", tijd: "23:00" },
  { href: "g" },
];
const d = alleenVandaag({ gegenereerd: gen, items: [], filmpjes: [], dumpert }, now);
assert.deepEqual(d.dumpert.map((x: any) => x.href), ["a", "c", "e"]);
assert.deepEqual(d.oud, { items: 0, filmpjes: 0, dumpert: 4 });
const dOud = alleenVandaag({ gegenereerd: "2026-10-29T22:00:00+01:00", dag_samenvatting: "x", dumpert }, now);
assert.deepEqual([dOud.dumpert, dOud.oud.dumpert, dOud.dag_samenvatting], [[], dumpert.length, ""]);
const dGeen = alleenVandaag({ gegenereerd: gen, dumpert: "geen lijst" }, now);
assert.deepEqual([dGeen.dumpert, dGeen.oud.dumpert], [[], 0]);
console.log("✓ Dumpert alleen vandaag");

// Zonder geldige gegenereerd-datum is niets van vandaag; geen object blijft ongemoeid.
const geenGen = alleenVandaag({ dag_samenvatting: "x", items: [{ t: now }], dumpert: [{ t: now }] }, now);
assert.deepEqual([geenGen.items, geenGen.dumpert, geenGen.dag_samenvatting], [[], [], ""]);
assert.equal(alleenVandaag(null, now), null);
assert.equal(alleenVandaag("tekst", now), "tekst");
console.log("✓ ongeldige invoer");

console.log("vandaag-randgevallen: geslaagd");
