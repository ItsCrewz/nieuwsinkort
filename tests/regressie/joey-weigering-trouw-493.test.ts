import assert from "node:assert/strict";
import item from "../fixtures/joey/trouw-colofon.json";
import weigeringen from "../fixtures/joey/weigeringen-493.json";
import { bruikbareInvoer, isWeigering, weigerzin } from "../../worker/src/weigering";
import { zuiverSom } from "../../worker/src/somcheck";

// De oude somcontrole liet dit echte bericht door.
assert.ok(zuiverSom({ ...item, punten: [] }));
assert.equal(isWeigering(item), true);
assert.equal([item].filter((i) => !isWeigering(i)).length, 0);
for (const s of ["De bron bevat geen tekst over het onderwerp.", "Ik kan geen samenvatting maken.", "I cannot summarize this article.", "I'm sorry, no information is available.", "As an AI I cannot answer.", "The source is not available."]) assert.equal(weigerzin(s), true, s);
assert.equal(weigeringen.length, 12);
for (const voorbeeld of weigeringen) assert.equal(isWeigering(voorbeeld), true, voorbeeld.kop);
for (const s of ["De politie geeft geen informatie over de verdachte", "Er is nog geen informatie over slachtoffers", "Het ministerie wil geen gegevens delen", "Over de oorzaak is geen informatie beschikbaar", "De app is niet beschikbaar in Nederland", "De trein is niet beschikbaar door een storing.", "De politie heeft geen informatie vrijgegeven over de verdachte.", "Er is geen informatieplicht voor kleine bedrijven."]) {
  assert.equal(weigerzin(s), false, s);
  assert.equal(isWeigering({ kop: s, ai: s, samenvatting: s, punten: [s] }), false, s);
}
assert.equal(isWeigering({ kop: "Nieuws", punten: ["Er is geen informatie beschikbaar over dit onderwerp."] }), true);
assert.equal(bruikbareInvoer([{ t: "Het colofon van Trouw", s: "" }]), false);
assert.equal(bruikbareInvoer([{ t: "Het colofon van Trouw", s: "Het colofon van Trouw" }]), false);
assert.equal(bruikbareInvoer([{ t: "Nieuws", s: "De gemeente bouwt volgend jaar een nieuwe brug over de rivier voor fietsers en voetgangers." }]), true);
assert.equal(bruikbareInvoer([{ t: "Nieuws", artikel: ["De gemeente bouwt volgend jaar een nieuwe brug over de rivier voor fietsers en voetgangers."] }]), true);
console.log("Regressie #493 geslaagd");
