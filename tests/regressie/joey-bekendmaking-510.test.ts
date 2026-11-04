import assert from "node:assert/strict";
import items from "../fixtures/joey/bekendmaking-510.json";
import { extractief } from "../../worker/src/extractief";

const item = items[0];
assert.equal(extractief({ t: item.kop, s: item.ai }, true)?.ai, "Officiële bekendmaking. De volledige tekst staat bij de bron.", "soortlabel wordt eerlijke bronverwijzing");

import { bekendmakingFallback, bekendmakingTekst, toonBekendmaking } from "../../src/bekendmaking";
assert.equal(toonBekendmaking(item).ai, bekendmakingFallback, "bewaard item toont bronverwijzing");
assert.equal(toonBekendmaking(item).samenvatting, "", "bewaard soortlabel verdwijnt");
assert.equal(toonBekendmaking(items[1]).ai, items[1].ai, "echte ruwe tekst blijft behouden");
assert.equal(bekendmakingTekst("&lt;strong&gt;Omgevingsvergunning:&lt;/strong&gt;"), "", "opmaak en entiteiten verdwijnen uit soortlabel");
assert.equal(bekendmakingTekst("<b>Omgevingsvergunning:</b> De aanvraag ligt ter inzage."), "Omgevingsvergunning: De aanvraag ligt ter inzage.", "inhoud na label blijft behouden");
