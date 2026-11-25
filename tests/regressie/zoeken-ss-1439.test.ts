import assert from "node:assert/strict";
import { markeerDelen } from "../../src/zoek";

const gemarkeerd = (tekst: string, q: string) => markeerDelen(tekst, q).filter((d) => d.markeer).map((d) => d.tekst);

assert.deepEqual(gemarkeerd("Straße in Wien", "strasse"), ["Straße"]);
assert.deepEqual(gemarkeerd("Strasse in Wien", "Straße"), ["Strasse"]);
assert.deepEqual(gemarkeerd("Strasse in Wien", "STRAẞE"), ["Strasse"]);
// Woordbegin blijft gelden: geen treffer midden in een woord.
assert.deepEqual(gemarkeerd("Hauptstraße", "strasse"), []);
assert.ok(gemarkeerd("Straße", "stras").length === 1);
// Meerdere zoekwoorden en hoofdletters.
assert.deepEqual(gemarkeerd("STRAßE en Wien", "strasse WIEN"), ["STRAßE", "Wien"]);
console.log("zoeken-ss-1439: tests geslaagd");
