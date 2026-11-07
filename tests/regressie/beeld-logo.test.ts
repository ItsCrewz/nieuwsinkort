import assert from "node:assert/strict";
import { goedBeeld, uniekeBeelden } from "../../src/beeld";
import { schoon } from "../../src/schoon";

const foto = "https://example.nl/blogoverzicht/foto.jpg";
for (const url of [foto, "https://example.nl/foto-blogoverzicht.jpg", "https://example.nl/catalogo/foto.jpg"]) {
  assert.equal(goedBeeld(url), true, url);
}
for (const url of [
  "https://example.nl/logo.png", "https://example.nl/LOGO/foto.jpg",
  "https://example.nl/site-logo_klein.png", "https://example.nl/foto.jpg?type=logo",
  "https://example.nl/placeholder.jpg", "https://example.nl/foto.svg", "https://example.nl/foto.gif",
  "https://example.nl/foto.jpg?w=120", "https://example.nl/100x100/foto.jpg",
]) {
  assert.equal(goedBeeld(url), false, url);
}
assert.deepEqual(uniekeBeelden(["https://example.nl/logo.png", foto]), [foto]);
assert.deepEqual(schoon({ items: [{ beelden: ["https://example.nl/logo.png", foto] }] }).items[0].beelden, [foto]);
