import assert from "node:assert/strict";
import item from "../fixtures/joey/trouw-colofon.json";
import weigeringen from "../fixtures/joey/weigeringen-493.json";
import { bruikbareInvoer, isWeigering, weigerzin } from "../../worker/src/weigering";
import { zuiverSom } from "../../worker/src/somcheck";

// De oude somcontrole liet dit echte bericht door.
assert.equal(zuiverSom({ ...item, punten: [] }), null);
assert.equal(isWeigering(item), true);
assert.equal([item].filter((i) => !isWeigering(i)).length, 0);
for (const s of ["De bron bevat geen tekst over het onderwerp.", "Ik kan geen samenvatting maken.", "I cannot summarize this article.", "I'm sorry, no information is available.", "As an AI I cannot answer.", "The source is not available."]) assert.equal(weigerzin(s), true, s);
assert.equal(weigeringen.length, 12);
for (const voorbeeld of weigeringen) assert.equal(isWeigering(voorbeeld), true, voorbeeld.kop);
for (const s of ["Geen nieuws over vermiste wandelaar na nieuwe zoekactie", "Minister: ik kan geen informatie geven over de onderhandelingen", "De politie geeft geen informatie over de verdachte", "Er is nog geen informatie over slachtoffers", "Het ministerie wil geen gegevens delen", "Over de oorzaak is geen informatie beschikbaar", "De app is niet beschikbaar in Nederland", "De trein is niet beschikbaar door een storing.", "De politie heeft geen informatie vrijgegeven over de verdachte.", "Er is geen informatieplicht voor kleine bedrijven."]) {
  assert.equal(weigerzin(s), false, s);
  assert.equal(isWeigering({ kop: s, ai: s, samenvatting: s, punten: [s] }), false, s);
}
for (const zin of ["Ik kan dit artikel niet samenvatten omdat de brontekst ontbreekt", "No information is available about this topic.", "Ik kan geen samenvatting maken omdat de tekst ontbreekt."]) {
  const volledig = { kop: "Ontwikkelingen rond een onderwerp", ai: zin, samenvatting: "Deze bron biedt geen verdere inhoud voor een betrouwbare beschrijving van het onderwerp.", punten: [] };
  assert.equal(isWeigering(volledig), true, zin);
  assert.equal(zuiverSom(volledig), null, zin);
}
for (const zin of ["Ik kan dit niet samenvatten.", "Ik kan dit bericht niet samenvatten.", "Ik kan geen samenvatting geven.", "Er is geen inhoud beschikbaar.", "Er is geen brontekst beschikbaar.", "De tekst bevat geen informatie.", "Geen informatie beschikbaar", "I cannot summarize this article.", "No content available", "As an AI I cannot answer."]) {
  for (const veld of ["ai", "samenvatting", "punten"] as const) {
    const volledig = { kop: "Gemeente presenteert nieuwe plannen voor het centrum", ai: "Het stadsbestuur bespreekt de plannen tijdens een openbare vergadering.", samenvatting: "De gemeenteraad bespreekt binnenkort de gevolgen voor bewoners en ondernemers.", punten: [] as string[], [veld]: veld === "punten" ? [zin] : zin };
    assert.equal(isWeigering(volledig), true, `${veld}: ${zin}`);
    assert.equal(zuiverSom(volledig), null, `${veld}: ${zin}`);
  }
}
for (const zin of ["Minister: “Ik kan geen samenvatting geven van het vertrouwelijke overleg”", "Volgens de politie is er geen informatie beschikbaar over dit onderwerp.", "Er is geen inhoud beschikbaar, zegt de minister.", "'Ik kan dit niet samenvatten', meldt de woordvoerder."]) {
  const volledig = { kop: "Overleg over vertrouwelijke stukken", ai: zin, samenvatting: "De betrokken partijen bespreken de situatie tijdens een besloten overleg.", punten: [] };
  assert.equal(isWeigering(volledig), false, zin);
  assert.notEqual(zuiverSom(volledig), null, zin);
}
assert.equal(isWeigering({ kop: "Ik kan dit niet samenvatten", ai: "De gemeente licht haar plannen toe." }), false);
assert.equal(isWeigering({ kop: "Nieuws", punten: ["Er is geen informatie beschikbaar over dit onderwerp."] }), true);
assert.equal(bruikbareInvoer([{ t: "Het colofon van Trouw", s: "" }]), false);
assert.equal(bruikbareInvoer([{ t: "Het colofon van Trouw", s: "Het colofon van Trouw" }]), false);
assert.equal(bruikbareInvoer([{ t: "Nieuws", s: "De gemeente bouwt volgend jaar een nieuwe brug over de rivier voor fietsers en voetgangers." }]), true);
assert.equal(bruikbareInvoer([{ t: "Nieuws", artikel: ["De gemeente bouwt volgend jaar een nieuwe brug over de rivier voor fietsers en voetgangers."] }]), true);
console.log("Regressie #493 geslaagd");
