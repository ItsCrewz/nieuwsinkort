import assert from "node:assert/strict";
import { nieuweAlineas, nieuwePunten } from "../../src/dubbel";

const paren = [
  ["De raad stemt voor het voorstel.", "De raad stemt tegen het voorstel."],
  ["De lamp gaat aan.", "De lamp gaat uit."],
  ["De verwarming gaat in.", "De verwarming gaat uit."],
  ["De slagboom gaat op.", "De slagboom gaat af."],
];
for (const [eerste, tweede] of paren) for (const [bron, nieuw] of [[eerste, tweede], [tweede, eerste]]) {
  assert.deepEqual(nieuwePunten([nieuw], bron, ""), [nieuw]);
  assert.deepEqual(nieuwePunten([bron, nieuw], "", ""), [bron, nieuw]);
  assert.deepEqual(nieuweAlineas([nieuw], [bron]), [nieuw]);
  assert.deepEqual(nieuwePunten([bron], bron, ""), []);
  assert.deepEqual(nieuweAlineas([bron], [bron]), []);
}
console.log("ok - tegenstrijdige standpunten blijven zichtbaar");
