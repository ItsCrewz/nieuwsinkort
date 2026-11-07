// #829: de deellink blijft bij bronfiltering gelijk aan de ongefilterde dagdata.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { artikelId, artikelPad, linkId } from "../../src/artikelid";
import { buildSources, filterArtikelBronnen, sourceKey } from "../../src/sources";
import { onRequestGet } from "../../functions/bericht/[[pad]]";
import type { Item } from "../../src/types";

const item = JSON.parse(readFileSync("tests/regressie/fixtures/artikel-bronnen-829.json", "utf8")) as Item;
const { index } = buildSources(null, null);
const uit = new Set([sourceKey(index, "nl", item.bronnen[0].site, item.bronnen[0].href)]);
const dag = "2026-11-04";
const echteNu = Date.now;
Date.now = () => Date.parse(`${dag}T12:00:00Z`);
try {
  for (const origineel of [item, { ...item, id: linkId("https://voorbeeld.nl/anker") }]) {
    const gefilterd = filterArtikelBronnen(origineel, index, uit)!;
    assert.deepEqual(gefilterd.bronnen, [origineel.bronnen[1]]);
    assert.equal(artikelId(gefilterd), artikelId(origineel));
    assert.equal(artikelPad(gefilterd, dag), artikelPad(origineel, dag));
    assert.equal(artikelPad(filterArtikelBronnen(origineel, index, new Set())!, dag), artikelPad(origineel, dag));
    assert.equal(origineel.bronnen.length, 2);
    const env = {
      NIEUWS: { get: async () => `${dag}\ntag\n${JSON.stringify({ gegenereerd: `${dag}T09:00:00Z`, items: [origineel] })}` },
      ASSETS: { fetch: async () => new Response(readFileSync("index.html", "utf8"), { headers: { "Content-Type": "text/html" } }) },
    };
    const pad = artikelPad(gefilterd, dag);
    const response = await onRequestGet({ request: new Request(`https://nieuwsinkort.nl${pad}`), env, waitUntil: () => {} });
    assert.equal(response.status, 200);
    assert.ok((await response.text()).includes(`https://nieuwsinkort.nl${pad}`));
  }
} finally { Date.now = echteNu; }
