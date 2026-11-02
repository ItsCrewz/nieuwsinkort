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
