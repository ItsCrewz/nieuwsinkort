import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { actieveBronnen, buildSources, sourceKey } from "../../src/sources";
import { uitgebreidOntdubbeld, filterMeer } from "../../src/uitgebreid";
import type { Data, Item, Meer } from "../../src/types";

// Een werkelijk samengevoegd bericht; de extra tekst is voor deze regressie aangevuld.
const fixture = JSON.parse(readFileSync("tests/fixtures/joey/ruw-dubbel-499.json", "utf8"));
const item: Item = (Array.isArray(fixture) ? fixture : [fixture]).find((x: Item) => x.bronnen?.length >= 2);
const [a, b] = item.bronnen;
const meer: Meer = {
  uitleg: ["Algemene uitleg blijft beschikbaar."],
  perBron: [{ ...a, punten: ["Eerste bron meldt iets."] }, { ...b, punten: ["Tweede bron meldt iets."] }],
  uittreksel: [{ ...a, alineas: ["Eerste brontekst."] }, { ...b, alineas: ["Tweede brontekst."] }],
};
const data = { items: [item], filmpjes: [], dumpert: [] } as unknown as Data;
const { index } = buildSources(null, data);
const groep = item.cat === "buitenland" || item.cat === "sport" ? "nl" : item.cat;
const off = new Set([sourceKey(index, groep, b.site, b.href)]);
assert.equal(filterMeer(meer, undefined), meer);
const gefilterd = filterMeer(meer, actieveBronnen(item, index, off))!;
assert.deepEqual(gefilterd.uitleg, meer.uitleg);
assert.deepEqual(gefilterd.perBron?.map((bron) => bron.href), [a.href]);
assert.deepEqual(gefilterd.uittreksel?.map((bron) => bron.href), [a.href]);
assert.deepEqual(uitgebreidOntdubbeld(item, { ...gefilterd, uitleg: [] }).uitgebreid, ["Eerste brontekst."]);
// Een nieuwe filterstand terwijl hetzelfde bericht open is levert meteen andere tekst op.
const omgewisseld = filterMeer(meer, actieveBronnen(item, index, new Set([sourceKey(index, groep, a.site, a.href)])))!;
assert.deepEqual(omgewisseld.perBron?.map((bron) => bron.href), [b.href]);
assert.deepEqual(omgewisseld.uittreksel?.map((bron) => bron.href), [b.href]);
assert.deepEqual(filterMeer({ perBron: [{ ...b, site: a.site, punten: ["Ander artikel"] }] }, [a])?.perBron, []);
assert.deepEqual(filterMeer(meer, [])?.uittreksel, []);
console.log("bronnenfilter extra tekst: regressie geslaagd");
