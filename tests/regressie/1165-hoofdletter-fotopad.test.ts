import assert from "node:assert/strict";
import { beeldKey, uniekeBeelden } from "../../src/beeld";

const a = "https://example.nl/nieuws/FotoABC.jpg";
const b = "https://example.nl/nieuws/fotoabc.jpg";
assert.notEqual(beeldKey(a), beeldKey(b));
assert.deepEqual(uniekeBeelden([a, b]), [a, b]);
assert.notEqual(beeldKey("https://example.nl/Map/foto.jpg"), beeldKey("https://example.nl/map/foto.jpg"));
// host, extensie en maatvarianten blijven ontdubbeld
assert.equal(beeldKey("https://WWW.Example.nl/nieuws/FotoABC.JPG"), beeldKey(a));
assert.equal(beeldKey("https://example.nl/nieuws/FotoABC-1200X675.jpg"), beeldKey(a));
assert.equal(beeldKey("https://example.nl/nieuws/1200X675/FotoABC.jpg"), beeldKey(a));
assert.deepEqual(uniekeBeelden([a, a]), [a]);
