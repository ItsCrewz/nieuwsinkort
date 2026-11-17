import assert from "node:assert/strict";
import { berichtHtml, beschrijving } from "../../src/berichthtml";

const sjabloon = '<html><head><title></title><script type="application/ld+json">{}</script></head><body><div id="root"></div></body></html>';
for (const teken of ["😀", "𐐷"]) {
  for (const lengte of [152, 153, 154]) {
    const tekst = "a".repeat(lengte) + teken + "b".repeat(10);
    const resultaat = beschrijving(tekst);
    assert.equal(resultaat, "a".repeat(lengte <= 152 ? lengte : 153) + (lengte === 152 ? teken : lengte === 154 ? "a" : "") + "…");
    assert.ok(resultaat.isWellFormed());
    assert.ok(resultaat.length <= 155);
  }
  for (const lengte of [108, 109, 110]) {
    const kop = "a".repeat(lengte) + teken + '</script> & "nieuws"';
    const html = berichtHtml(sjabloon, { kop, ai: "b".repeat(153) + teken + "verder" }, "2026-11-15");
    const inhoud = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)![1];
    const json = JSON.parse(inhoud);
    assert.equal(json.headline, "a".repeat(lengte === 109 ? 109 : 108) + (lengte === 108 ? teken : lengte === 110 ? "aa" : ""));
    assert.ok(json.headline.isWellFormed());
    assert.ok(json.description.isWellFormed());
    assert.ok(!inhoud.includes("</script>"));
    assert.ok(html.includes(`<h1>${"a".repeat(lengte)}${teken}&lt;/script&gt; &amp; &quot;nieuws&quot;</h1>`));
    assert.ok(html.includes(`name="description" content="${"b".repeat(153)}…"`));
  }
}
assert.ok(beschrijving("Nederlandse tekst ".repeat(20)).length <= 155);
