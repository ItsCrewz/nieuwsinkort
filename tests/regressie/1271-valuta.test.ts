import assert from "node:assert/strict";
import { nieuweAlineas, nieuwePunten } from "../../src/dubbel";

const paren = [
  ["De prijs is € 20.", "De prijs is $ 20."],
  ["De prijs is £20,50.", "De prijs is €20,50."],
  ["De prijs is 20 USD.", "De prijs is 20 EUR."],
  ["De prijs is € 20 en $ 30.", "De prijs is $ 20 en € 30."],
];
for (const [eerste, tweede] of paren) for (const [bron, nieuw] of [[eerste, tweede], [tweede, eerste]]) {
  assert.deepEqual(nieuwePunten([nieuw], bron, ""), [nieuw]);
  assert.deepEqual(nieuwePunten([bron, nieuw], "", ""), [bron, nieuw]);
  assert.deepEqual(nieuweAlineas([nieuw], [bron]), [nieuw]);
  assert.deepEqual(nieuwePunten([bron], bron, ""), []);
  assert.deepEqual(nieuweAlineas([bron], [bron]), []);
}
const herhalingen = [
  ["De prijs is €20.", "De prijs is 20 euro."],
  ["De prijs is € 20.", "De prijs is EUR 20."],
  ["De prijs is $20.", "De prijs is 20 USD."],
  ["De prijs is £20.", "De prijs is 20 GBP."],
];
for (const [eerste, tweede] of herhalingen) for (const [bron, nieuw] of [[eerste, tweede], [tweede, eerste]]) {
  assert.deepEqual(nieuwePunten([nieuw], bron, ""), []);
  assert.deepEqual(nieuwePunten([bron, nieuw], "", ""), [bron]);
  assert.deepEqual(nieuweAlineas([nieuw], [bron]), []);
}
console.log("ok - valutaverschillen blijven zichtbaar");
