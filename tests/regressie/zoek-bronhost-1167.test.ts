import assert from "node:assert/strict";
import { zoekItems } from "../../src/zoek";
import { buildSources, filterArtikelBronnen, sourceKey } from "../../src/sources";
import type { Item } from "../../src/types";

const maak = (site: string, href: string): Item => ({ cat: "nl", kop: "Kop", tijd: "", bronnen: [{ site, href }] } as Item);
const nu = maak("Redactie", "https://www.nu.nl/binnenland/123/artikel?utm_source=tracking#deel");
for (const term of ["nu.nl", "nu", "NU.nl"]) assert.deepEqual(zoekItems([nu], term), [nu], term);
assert.equal(zoekItems([maak("X", "https://www.bbc.co.uk/news/1")], "bbc.co.uk").length, 1);
// Pad, query en hash staan niet in de index.
for (const term of ["binnenland", "tracking", "utm_source", "deel", "https", "www"]) assert.deepEqual(zoekItems([nu], term), [], term);
// Ongeldige of niet-http adressen breken niets.
for (const href of ["", "geen url", "javascript:alert(1)", "/relatief", "ftp://nu.nl/x"]) assert.deepEqual(zoekItems([maak("Bron", href)], "nu.nl"), [], href);
assert.equal(zoekItems([maak("Bron", undefined as unknown as string)], "bron").length, 1);
// Een uitgeschakelde bron valt vóór het zoeken weg, dus ook haar host levert geen treffer.
const { index } = buildSources(null, { items: [nu] } as never);
const uit = new Set([sourceKey(index, "nl", "Redactie", nu.bronnen[0].href)]);
assert.equal(filterArtikelBronnen(nu, index, uit), null);
const twee = { ...nu, bronnen: [...nu.bronnen, { site: "NOS", href: "https://nos.nl/a" }] } as Item;
const rest = filterArtikelBronnen(twee, buildSources(null, { items: [twee] } as never).index, new Set([sourceKey(index, "nl", "Redactie", nu.bronnen[0].href)]));
assert.deepEqual(zoekItems([rest!], "nu.nl"), []);
assert.equal(zoekItems([rest!], "nos.nl").length, 1);
