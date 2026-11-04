import assert from "node:assert/strict";
import items from "../fixtures/joey/bekendmaking-510.json";
import { extractief } from "../../worker/src/extractief";

const item = items[0];
assert.equal(extractief({ t: item.kop, s: item.ai }, true, true)?.ai, "Officiële bekendmaking. De volledige tekst staat bij de bron.", "soortlabel wordt eerlijke bronverwijzing");

import { bekendmakingFallback, bekendmakingTekst, toonBekendmaking } from "../../src/bekendmaking";
assert.equal(toonBekendmaking(item).ai, bekendmakingFallback, "bewaard item toont bronverwijzing");
assert.equal(toonBekendmaking(item).samenvatting, "", "bewaard soortlabel verdwijnt");
assert.equal(toonBekendmaking(items[1]).ai, items[1].ai, "echte ruwe tekst blijft behouden");
assert.equal(bekendmakingTekst("&lt;strong&gt;Omgevingsvergunning:&lt;/strong&gt;"), "", "opmaak en entiteiten verdwijnen uit soortlabel");
assert.equal(bekendmakingTekst("<b>Omgevingsvergunning:</b> De aanvraag ligt ter inzage."), "Omgevingsvergunning: De aanvraag ligt ter inzage.", "inhoud na label blijft behouden");
assert.notEqual(extractief({ t: "Gemeente past regels aan", s: "Melding" }, true)?.ai, bekendmakingFallback, "ander bericht met omschrijving Melding krijgt geen bekendmakingstekst");
assert.equal(bekendmakingTekst("Prijs <5 en >3 euro"), "Prijs <5 en >3 euro", "wiskundige tekens zijn geen tags");
assert.equal(bekendmakingTekst("a <b>vet</b> <span class=x>b</span>"), "a vet b", "echte tags verdwijnen");
