// Echte artikelen en gecachete uitleg uit de bevroren data van 2 november 2026.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { nieuweAlineas, nieuwePunten } from "../../src/dubbel";
import { uitgebreidOntdubbeld } from "../../src/uitgebreid";

const [batterij, polestar] = JSON.parse(readFileSync("tests/fixtures/joey/dubbel-feiten.json", "utf8"));
const uitleg = (item: any) => uitgebreidOntdubbeld(item, item.meerData).uitgebreid.join(" ");
assert.match(uitleg(batterij), /18 februari 2027/);
assert.match(uitleg(polestar), /Een opvolger is in aantocht\. Die wordt ontworpen door Philipp Römers\./);
assert.match(uitleg(polestar), /Er is nog voorraad\./);
assert.deepEqual(nieuweAlineas(["De verkoop start op 18 februari 2027."], ["De verkoop start in februari 2027."]), ["De verkoop start op 18 februari 2027."]);
assert.deepEqual(nieuweAlineas(["De verkoop start vandaag. Dit gebeurt in Haarlem."], ["De verkoop start vandaag."]), ["De verkoop start vandaag. Dit gebeurt in Haarlem."]);
assert.deepEqual(nieuweAlineas(["De verkoop start vandaag.", "Dit gebeurt in Haarlem."], ["De verkoop start vandaag."]), ["De verkoop start vandaag.", "Dit gebeurt in Haarlem."]);
assert.deepEqual(nieuwePunten(["De verkoop start op 18 februari 2027."], "De verkoop start in februari 2027.", ""), ["De verkoop start op 18 februari 2027."]);
console.log("ok - unieke feiten en verwijszinnen blijven behouden");

for (const woord of ["nu", "nog", "al", "pas", "weer", "niet meer", "nooit"]) {
  const gewoon = "De verkoop start in Haarlem.";
  const bijzonder = `De verkoop start ${woord} in Haarlem.`;
  for (const [bron, nieuw] of [[gewoon, bijzonder], [bijzonder, gewoon]]) {
    assert.deepEqual(nieuwePunten([nieuw], bron, ""), [nieuw], `${woord}: punt`);
    assert.deepEqual(nieuweAlineas([nieuw], [bron]), [nieuw], `${woord}: uitleg`);
  }
}

for (const [eerste, tweede] of [
  ["Israël valt Iran aan.", "Iran valt Israël aan."],
  ["Israël en Amerika steunen Iran en Jordanië.", "Iran en Jordanië steunen Israël en Amerika."],
  ["De ploeg verslaat de tegenstander met 3 tegen 2.", "De ploeg verslaat de tegenstander met 2 tegen 3."],
]) {
  for (const [bron, nieuw] of [[eerste, tweede], [tweede, eerste]]) {
    assert.deepEqual(nieuwePunten([nieuw], bron, ""), [nieuw]);
    assert.deepEqual(nieuwePunten([bron, nieuw], "", ""), [bron, nieuw]);
    assert.deepEqual(nieuweAlineas([nieuw], [bron]), [nieuw]);
    assert.deepEqual(nieuwePunten([bron], bron, ""), []);
    assert.deepEqual(nieuweAlineas([bron], [bron]), []);
  }
}
