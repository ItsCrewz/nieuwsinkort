import assert from "node:assert/strict";
import { ytVerwijderBesluit } from "../../src/ytstart";

// Joey veegt terug naar een geblokkeerd filmpje: sla verder terug over, niet vooruit.
for (const code of [100, 101, 150, 152]) {
  assert.deepEqual(ytVerwijderBesluit(code, 2, 2, 4, -1), { verwijder: true, actief: 1 });
}
// Bij de eerste slide bestaat geen vorig filmpje; laat het vangnet staan.
assert.deepEqual(ytVerwijderBesluit(150, 0, 0, 4, -1), { verwijder: false, actief: 0 });
// Een vooraf geladen geblokkeerde buur mag de huidige slide niet vooruit sturen.
assert.deepEqual(ytVerwijderBesluit(150, 1, 2, 4, -1), { verwijder: true, actief: 1 });
console.log("✓ terugvegen langs geblokkeerde YouTube-video blijft achteruit gaan (#348)");
