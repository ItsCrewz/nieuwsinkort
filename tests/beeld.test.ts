// Draai: npm test  (beeld-URL's en og:image, src/beeld.ts)
import assert from "node:assert/strict";
import { beeldKey, beterBeeld, bruikbareAfmeting, goedBeeld, ogImage, uniekeBeelden } from "../src/beeld";

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log("✓", name); };

t("goedBeeld accepteert bruikbare URLs en weigert ongeldige afbeeldingen", () => {
  assert.equal(goedBeeld("https://nieuws.nl/foto.jpg"), true);
  assert.equal(goedBeeld("http://nieuws.nl/foto.webp"), true);
  assert.equal(goedBeeld("ftp://nieuws.nl/foto.jpg"), false);
  assert.equal(goedBeeld("https://nieuws.nl/logo.png"), false);
  assert.equal(goedBeeld("https://nieuws.nl/foto.jpg?width=120"), false);
  assert.equal(goedBeeld("https://youtube.com/watch?v=abc"), false);
});

t("afgebakende kleine afmetingen blokkeren geen grotere foto (#1183)", () => {
  for (const url of ["https://nieuws.nl/2021x1234/foto.jpg", "https://nieuws.nl/foto.jpg?versie=2021x1234", "https://nieuws.nl/16x9/foto.jpg", "https://nieuws.nl/foto-4x3.jpg", "https://nieuws.nl/foto.jpg?ratio=16x9", "https://nieuws.nl/3x2/foto.jpg"]) {
    assert.deepEqual(uniekeBeelden([url]), [url]);
  }
  for (const url of ["https://nieuws.nl/1x1/foto.jpg", "https://nieuws.nl/foto-1x1.jpg", "https://nieuws.nl/foto.jpg?resize=1x1", "https://nieuws.nl/100x100/foto.jpg", "https://nieuws.nl/foto.jpg?width=120", "https://nieuws.nl/foto.jpg?width=100x100","https://nieuws.nl/1X1/foto.jpg", "https://nieuws.nl/foto.jpg?size=1X1", "https://nieuws.nl/track/1X1.png", "https://nieuws.nl/img1x1.png", "https://nieuws.nl/t1x1.png", "https://nieuws.nl/beacon1x1.jpg"]) {
    assert.equal(goedBeeld(url), false, url);
  }
});

t("small als onderwerp blijft bruikbaar, als maatsuffix niet (#1164)", () => {
  for (const naam of ["small-business.jpg", "report-small-business.jpg"]) {
    assert.equal(goedBeeld(`https://example.org/news/${naam}`), true);
  }
  assert.equal(goedBeeld("https://example.org/news/report-small.jpg"), false);
  assert.equal(goedBeeld("https://example.org/news/report-small.jpg?v=1"), false);
});

t("avatar als onderwerp blijft bruikbaar, profielavatars niet (#1280)", () => {
  for (const url of [
    "https://nieuws.nl/media/avatar-fire-and-ash-trailer-1200x675.jpg",
    "https://nieuws.nl/2025/12/nieuwe-avatar-film-recensie.jpg",
    "https://nieuws.nl/avatar-the-way-of-water.webp",
  ]) assert.equal(goedBeeld(url), true, url);
  for (const url of [
    "https://avatars.githubusercontent.com/u/1234.jpg",
    "https://nieuws.nl/avatars/42/foto.jpg",
    "https://nieuws.nl/uploads/avatar.png",
    "https://nieuws.nl/uploads/avatar_42.jpg",
    "https://nieuws.nl/img/user-avatar.jpg",
    "https://nieuws.nl/img/default-avatar.jpg",
    "https://nieuws.nl/foto.jpg?avatar=1",
    "https://nieuws.nl/gravatar/abc.jpg",
  ]) assert.equal(goedBeeld(url), false, url);
});

t("beeldKey herkent varianten van hetzelfde beeld", () => {
  assert.equal(
    beeldKey("https://cdn1.voorbeeld.nl/foto-1200x675.jpg?quality=80"),
    beeldKey("https://www.voorbeeld.nl/foto-600x338.jpg?width=600"),
  );
});

t("beterBeeld normaliseert gecodeerde Nu.nl-thumbnails", () => {
  assert.equal(
    beterBeeld(" https://images.nu.nl/m/abc123_sqr256/foto.jpg?x&#x3D;1&amp;y&#61;2 "),
    "https://images.nu.nl/m/abc123_sqr256/foto.jpg?x=1&y=2",
  );
  assert.equal(beterBeeld(" https://nieuws.nl/foto.jpg?x&#x3D;1&amp;y&#61;2 "), "https://nieuws.nl/foto.jpg?x=1&y=2");
});

t("uniekeBeelden behoudt de eerste bron, verwijdert dubbelen en respecteert max", () => {
  const urls = [
    "http://nieuws.nl/foto-1200x675.jpg",
    "https://cdn.nieuws.nl/foto-600x338.jpg",
    "https://nieuws.nl/logo.png",
    "https://nieuws.nl/andere-foto.jpg",
  ];
  assert.deepEqual(uniekeBeelden(urls), ["https://cdn.nieuws.nl/foto-600x338.jpg", "https://nieuws.nl/andere-foto.jpg"]);
  assert.deepEqual(uniekeBeelden(urls, 1), ["https://cdn.nieuws.nl/foto-600x338.jpg"]);
});

t("ogImage leest een relatieve og:image ten opzichte van de basis-URL", () => {
  assert.equal(
    ogImage('<meta property="og:image" content="/beelden/foto.jpg?bron=a&amp;maat=breed">', "https://nieuws.nl/artikelen/123"),
    "https://nieuws.nl/beelden/foto.jpg?bron=a&maat=breed",
  );
});

t("bruikbareAfmeting: staande foto blijft, icoon en banner niet (#996)", () => {
  assert.equal(bruikbareAfmeting(400, 1000), true);
  assert.equal(bruikbareAfmeting(400, 1400), true);
  assert.equal(bruikbareAfmeting(400, 1401), false);
  assert.equal(bruikbareAfmeting(100, 1000), false);
  assert.equal(bruikbareAfmeting(199, 300), false);
  assert.equal(bruikbareAfmeting(300, 119), false);
  assert.equal(bruikbareAfmeting(1200, 300), true);
  assert.equal(bruikbareAfmeting(1200, 299), false);
});

t("imgix: w × dpr telt als effectieve breedte; andere hosts en slechte dpr niet (#1224)", () => {
  const i = "https://voorbeeld.imgix.net/foto.jpg";
  for (const q of ["w=200&dpr=2", "w=150&dpr=2", "width=300&dpr=1", "w=100&dpr=3"]) assert.equal(goedBeeld(`${i}?${q}`), true, q);
  for (const q of ["w=100&dpr=2", "w=200", "w=200&dpr=1", "w=200&dpr=0", "w=200&dpr=-2", "w=200&dpr=99", "w=200&dpr=abc", "w=200&dpr=", "w=200&dpr=2&dpr=3", "w=200&dpr=2&h=100", "w=50&dpr=5"]) assert.equal(goedBeeld(`${i}?${q}`), false, q);
  assert.equal(goedBeeld(`${i}?dpr=2&w=200`), true);
  for (const q of ["w=100&imwidth=200&dpr=2", "imwidth=200&w=100&dpr=2", "resize=200&dpr=2", "im_w=200&dpr=2", "w=200&dpr=2&fit=max", "w=200&dpr=2&fit=clip&h=400", "w=200&dpr=2&ar=1:1", "w=200&dpr=2&max-w=100", "w=200&dpr=2&w=400", "w=200&dpr=2&rect=0,0,50,50", "w=200&dpr=2&crop=faces"]) assert.equal(goedBeeld(`${i}?${q}`), false, q);
  assert.equal(goedBeeld("https://nieuws.nl/foto.jpg?w=200&dpr=2"), false);
  assert.equal(goedBeeld("https://imgix.net.evil.nl/foto.jpg?w=200&dpr=2"), false);
  assert.equal(goedBeeld(`${i.replace("https", "ftp")}?w=200&dpr=2`), false);
  assert.equal(goedBeeld("https://voorbeeld.imgix.net/logo.png?w=200&dpr=2"), false);
});

console.log(`\n${n} tests geslaagd`);
