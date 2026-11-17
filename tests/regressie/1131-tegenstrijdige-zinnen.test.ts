import assert from "node:assert/strict";
import { nieuweAlineas, nieuwePunten } from "../../src/dubbel";

const voor = "De raad stemt voor het voorstel.";
const tegen = "De raad stemt tegen het voorstel.";
for (const [bron, nieuw] of [[voor, tegen], [tegen, voor]]) {
  assert.deepEqual(nieuwePunten([nieuw], bron, ""), [nieuw]);
  assert.deepEqual(nieuwePunten([bron, nieuw], "", ""), [bron, nieuw]);
  assert.deepEqual(nieuweAlineas([nieuw], [bron]), [nieuw]);
  assert.deepEqual(nieuwePunten([bron], bron, ""), []);
  assert.deepEqual(nieuweAlineas([bron], [bron]), []);
}
console.log("ok - tegenstrijdige standpunten blijven zichtbaar");
