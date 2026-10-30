import assert from "node:assert/strict";
import { artikelTekst, jinaTekst } from "../worker/src/artikel";

const eerste = "De gemeente onderzoekt samen met bewoners hoe het groene plein volgend jaar veiliger en toegankelijker kan worden gemaakt.";
const tweede = "Tijdens een openbare bijeenkomst bespreken de betrokken inwoners verschillende voorstellen voor meer bomen en brede wandelpaden.";
const html = `<p>${eerste}</p><p>${tweede}</p>`;

assert.deepEqual(artikelTekst(""), []);
assert.deepEqual(jinaTekst(""), []);
assert.deepEqual(artikelTekst(`<script>${eerste}</script><style>${tweede}</style><nav>Menu en links</nav>`), []);
assert.deepEqual(artikelTekst(`<article><p>  ${eerste} <script>verborgen tekst</script> </p><p>kort</p><p>${tweede}</p></article>`), [eerste, tweede]);
assert.deepEqual(artikelTekst(`<p>${eerste}</p><p>${eerste.toUpperCase()}</p><p>${tweede}</p>`), [eerste, tweede]);

// De eerste alinea wordt zo nodig afgebroken; latere alinea's blijven heel.
assert.deepEqual(artikelTekst(html, eerste.length), [eerste]);
assert.deepEqual(artikelTekst(html, eerste.length + tweede.length - 1), [eerste]);
assert.deepEqual(artikelTekst(html, eerste.length + tweede.length), [eerste, tweede]);
assert.deepEqual(artikelTekst(html, 70), [eerste.slice(0, 70).replace(/\s+\S*$/, "") + "…"]);
const lang = `${"Bewoners bespreken gezamenlijk de plannen voor nieuwe bomen en veilige wandelpaden. ".repeat(25)}Einde.`;
assert.deepEqual(artikelTekst(`<p>${lang}</p>`, 100), [lang.slice(0, 100).replace(/\s+\S*$/, "") + "…"]);

const metEntiteiten = "De gemeente &amp; bewoners bespreken caf&eacute;s, bomen &#233;n veilige straten in de buurt tijdens een openbare bijeenkomst.";
assert.deepEqual(artikelTekst(`<p>${metEntiteiten}</p>`), ["De gemeente & bewoners bespreken cafés, bomen én veilige straten in de buurt tijdens een openbare bijeenkomst."]);

const markdown = `Titel\nMarkdown Content:\n\n# ${eerste}\n\n![foto](https://voorbeeld.invalid/foto.jpg) [${tweede}](https://voorbeeld.invalid/bericht)\n\n${eerste}\n\n![alleen een afbeelding](https://voorbeeld.invalid/foto.jpg)`;
assert.deepEqual(jinaTekst(markdown), [eerste, tweede]);
assert.deepEqual(jinaTekst(`${eerste}\n\n${tweede}`, eerste.length + tweede.length - 1), [eerste]);
assert.deepEqual(jinaTekst(`${eerste}\n\n${tweede}`, eerste.length + tweede.length), [eerste, tweede]);
assert.deepEqual(jinaTekst(lang, 100), [lang]);
assert.deepEqual(jinaTekst(metEntiteiten), [metEntiteiten]);

console.log("✓ artikel-randgevallen");
