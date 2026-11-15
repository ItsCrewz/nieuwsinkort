import assert from "node:assert/strict";
import { goedBeeld, uniekeBeelden } from "../../src/beeld";
import { schoon } from "../../src/schoon";

const foto = "https://example.nl/nieuws/foto.jpg?tracking=1";
for (const url of [foto, "https://example.nl/nieuws/foto.jpg?utm_source=tracking&pixel=1", "https://example.nl/nieuws/foto.jpg?ref=placeholder"]) {
  assert.equal(goedBeeld(url), true, url);
}
for (const url of ["https://tracking.example.nl/foto.jpg", "https://doubleclick.net/foto.jpg", "https://feeds.feedburner.com/foto.jpg", "https://example.nl/placeholder.jpg?tracking=1", "https://example.nl/pixel.gif?x=1"]) {
  assert.equal(goedBeeld(url), false, url);
}
const beelden = [foto, "https://example.nl/nieuws/foto.jpg?tracking=2", "https://example.nl/nieuws/andere.jpg"];
assert.deepEqual(uniekeBeelden(beelden), [foto, beelden[2]]);
assert.deepEqual(schoon({ items: [{ beelden }] }).items[0].beelden, [foto, beelden[2]]);
