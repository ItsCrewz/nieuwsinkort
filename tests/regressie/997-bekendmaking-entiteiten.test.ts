import assert from "node:assert/strict";
import items from "../fixtures/joey/bekendmaking-510.json";
import { bekendmakingFallback, bekendmakingTekst, toonBekendmaking } from "../../src/bekendmaking";

assert.equal(bekendmakingTekst("Cr&egrave;me, caf&eacute;, &Eacute;&eacute;n en &euml; &iuml; &ouml; &uuml;"), "Crème, café, Één en ë ï ö ü");
assert.equal(bekendmakingTekst("&amp;egrave; &#233; &#x1F600; &amp;#xE8; &mdash; &euro;"), "è é 😀 è — €");
assert.equal(bekendmakingTekst("&onbekend; &#xZZ; &#999999999999; &#55296;"), "&onbekend; &#xZZ;");
assert.equal(bekendmakingTekst("&amp;lt;strong&amp;gt;Melding:&amp;lt;/strong&amp;gt;"), "");
assert.equal(bekendmakingTekst("&lt;img src=x onerror=alert(1)&gt;Tekst"), "Tekst");
assert.equal(toonBekendmaking({ ...items[0], ai: "&amp;lt;b&amp;gt;Melding&amp;lt;/b&amp;gt;", samenvatting: "" }).ai, bekendmakingFallback);
assert.equal(toonBekendmaking({ ...items[0], ai: "Cr&egrave;me", samenvatting: "caf&amp;eacute;" }).samenvatting, "café");
