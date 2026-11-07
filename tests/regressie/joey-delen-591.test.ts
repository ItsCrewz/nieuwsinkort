import assert from "node:assert/strict";
import { artikelUrl, deel } from "../../src/delen";

// Bericht uit de lokale terugvaldata van 28 oktober 2026.
const item = { kop: "Treinramp Spanje: tientallen doden", bronnen: [{ href: "https://nos.nl/l/2636985" }] };
const url = artikelUrl(item, "2026-10-28");
let gekopieerd = "";
assert.equal(await deel({
  share: async () => { throw Error("Delen mag niet worden aangeroepen"); },
  canShare: () => { throw Error("Controle geweigerd"); },
  clipboard: { writeText: async (tekst) => { gekopieerd = tekst; } },
}, item.kop, url), "gekopieerd");
assert.equal(gekopieerd, url);
