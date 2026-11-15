// Draai: npm test  (randgevallen voor beeld-URL's en og:image)
import assert from "node:assert/strict";
import { beeldKey, beterBeeld, goedBeeld, ogImage, uniekeBeelden } from "../src/beeld";

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log("✓", name); };

t("goedBeeld weigert lege waarden en data-URL's", () => {
  for (const url of [null, undefined, "", " ", "data:image/png;base64,aGVsbG8="]) {
    assert.equal(goedBeeld(url), false);
  }
});

t("goedBeeld weigert te kleine hoogteparameters (h, height), grens 160", () => {
  const b = "https://nieuws.nl/foto.jpg";
  for (const q of ["?height=80", "?h=159", "?HEIGHT=80", "?w=800&h=100", "?width=800&Height=159", "?x=1&h=0"]) assert.equal(goedBeeld(b + q), false, q);
  for (const q of ["?height=160", "?h=600", "?H=160", "?w=800&h=450", "?h=", "?h=abc", "?w=800", "?ah=80", "?height=80x"]) assert.equal(goedBeeld(b + q), true, q);
});

t("goedBeeld weigert svg ongeacht hoofdletters en query", () => {
  assert.equal(goedBeeld("https://nieuws.nl/beeld.svg"), false);
  assert.equal(goedBeeld("https://nieuws.nl/beeld.SVG?breedte=800"), false);
  assert.equal(goedBeeld("https://nieuws.nl/beeld.jpg"), true);
});

t("goedBeeld bewaakt de maatgrenzen van CDN-parameters", () => {
  assert.equal(goedBeeld("https://cdn.nieuws.nl/beeld.jpg?width=299"), false);
  assert.equal(goedBeeld("https://cdn.nieuws.nl/beeld.jpg?width=300"), true);
  assert.equal(goedBeeld("https://cdn.nieuws.nl/300x159/beeld.jpg"), false);
  assert.equal(goedBeeld("https://cdn.nieuws.nl/300x160/beeld.jpg"), true);
});

t("beeldKey negeert CDN-maten en queryparameters maar niet de foto-identiteit", () => {
  const groot = "https://cdn1.nieuws.nl/1200x675/stadsbeeld-1200x675.jpg?width=1200&quality=80";
  const klein = "https://img.nieuws.nl/600x338/stadsbeeld-600x338.webp?width=600&quality=60";
  assert.equal(beeldKey(groot), beeldKey(klein));
  assert.notEqual(beeldKey(groot), beeldKey("https://cdn.nieuws.nl/1200x675/anderbeeld.jpg?width=1200"));
});

t("beeldKey herkent de oorspronkelijke foto achter een CDN-proxy", () => {
  const origineel = "https://nieuws.nl/fotos/stadsbeeld.jpg";
  const proxy = `https://cdn.voorbeeld.nl/image?url=${encodeURIComponent(origineel)}&w=800`;
  assert.equal(beeldKey(proxy), beeldKey(origineel));
});

t("beterBeeld decodeert CDN-parameters zonder de maat te wijzigen", () => {
  assert.equal(
    beterBeeld("  https://cdn.nieuws.nl/stadsbeeld.jpg?w&#61;800&#38;h&#x3d;450&#x26;fit=crop  "),
    "https://cdn.nieuws.nl/stadsbeeld.jpg?w=800&h=450&fit=crop",
  );
  assert.equal(beterBeeld("https://images.nu.nl/m/abc123_sqr256/foto.jpg?w=256"), "https://images.nu.nl/m/abc123_wd1280.jpg");
});

t("uniekeBeelden slaat null, undefined en onbruikbare waarden over", () => {
  assert.deepEqual(uniekeBeelden([null, undefined, "", "data:image/png;base64,aaa", "https://nieuws.nl/stadsbeeld.jpg"]), [
    "https://nieuws.nl/stadsbeeld.jpg",
  ]);
  assert.deepEqual(uniekeBeelden([null, undefined, ""]), []);
});

t("uniekeBeelden geeft precies max unieke beelden in bronvolgorde", () => {
  const eerste = "https://nieuws.nl/eerstebeeld.jpg";
  const tweede = "https://nieuws.nl/tweedebeeld.jpg";
  const derde = "https://nieuws.nl/derdebeeld.jpg";
  assert.deepEqual(uniekeBeelden([eerste, tweede], 2), [eerste, tweede]);
  assert.deepEqual(uniekeBeelden([null, eerste, eerste, tweede, derde], 2), [eerste, tweede]);
});

t("uniekeBeelden begrenst standaard tot twaalf unieke beelden", () => {
  const urls = Array.from({ length: 14 }, (_, i) => `https://nieuws.nl/stadsbeeld${i}.jpg`);
  assert.deepEqual(uniekeBeelden(urls.slice(0, 6)), urls.slice(0, 6));
  assert.deepEqual(uniekeBeelden(urls), urls.slice(0, 12));
});

t("ogImage lost een relatief pad met enkele aanhalingstekens en entities op", () => {
  assert.equal(
    ogImage("<meta property='og:image' content='../beeld.jpg?w=800&amp;h=450'>", "https://nieuws.nl/artikelen/2026/bericht"),
    "https://nieuws.nl/artikelen/beeld.jpg?w=800&h=450",
  );
  assert.equal(
    ogImage("<meta content='/foto.jpg' name='twitter:image'>", "https://nieuws.nl/artikel"),
    "https://nieuws.nl/foto.jpg",
  );
});

t("ogImage geeft een lege string bij ontbrekende of onbruikbare metadata", () => {
  assert.equal(ogImage("<title>Nieuws</title><meta name='description' content='tekst'>", "https://nieuws.nl/"), "");
  assert.equal(ogImage("<meta property='og:image' content=''>", "https://nieuws.nl/"), "");
  assert.equal(ogImage("<meta property='og:image' content='/foto.jpg'>", "geen geldige basis"), "");
});

t("protocol van beeld-URL's is hoofdletterongevoelig (#869)", () => {
  for (const p of ["https://", "HTTPS://", "HtTpS://"]) assert.equal(goedBeeld(`${p}images.example.org/foto.jpg`), true, p);
  assert.equal(goedBeeld("HTTP://images.example.org/foto.jpg"), true);
  for (const u of ["ftp://images.example.org/foto.jpg", "javascript:alert(1)", "HTTPS//images.example.org/foto.jpg", "niet een url"]) assert.equal(goedBeeld(u), false, u);
  assert.deepEqual(uniekeBeelden(["HTTPS://images.example.org/foto.jpg"]), ["https://images.example.org/foto.jpg"]);
  assert.deepEqual(uniekeBeelden(["HtTpS://a.example.org/x.jpg", "https://a.example.org/x.jpg"]), ["https://a.example.org/x.jpg"]);
  assert.deepEqual(uniekeBeelden(["HTTP://a.example.org/x.jpg", "ftp://a.example.org/y.jpg", "javascript:alert(1)", "kapot"]), []);
});

console.log(`\n${n} tests geslaagd`);