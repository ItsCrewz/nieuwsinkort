import assert from "node:assert/strict";
import { ogImage, uniekeBeelden } from "../../src/beeld";

const pagina = "https://nieuws.example/artikel/bericht";
const meta = (naam: string, waarde: string) => `<meta property="${naam}" content="${waarde}">`;
const twitter = '<meta content="/twitter.jpg" name="twitter:image:src">';

for (const ongeldig of ["", " ", "http://[", "javascript:alert(1)", "http://nieuws.example/foto.jpg", "/logo.svg"]) {
  const html = twitter + meta("og:image", ongeldig) + '<meta content="../foto.jpg?a=1&amp;b=2" property="og:image:url">';
  const beeld = ogImage(html, pagina);
  assert.equal(beeld, "https://nieuws.example/foto.jpg?a=1&b=2");
  assert.deepEqual(uniekeBeelden([beeld]), [beeld]);
}
assert.equal(ogImage(meta("og:image", "http://[") + twitter, pagina), "https://nieuws.example/twitter.jpg");
assert.equal(ogImage(meta("og:image", "data:image/png,test") + meta("twitter:image", "ftp://example.com/foto.jpg"), pagina), "");
assert.equal(ogImage(meta("og:image", "http://[") + meta("og:image:secure_url", "https://cdn.example/foto.jpg"), pagina), "https://cdn.example/foto.jpg");
