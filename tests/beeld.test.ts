// Draai: npm test  (beeld-URL's en og:image, src/beeld.ts)
import assert from "node:assert/strict";
import { beeldKey, beterBeeld, goedBeeld, ogImage, uniekeBeelden } from "../src/beeld";

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

t("beeldKey herkent varianten van hetzelfde beeld", () => {
  assert.equal(
    beeldKey("https://cdn1.voorbeeld.nl/foto-1200x675.jpg?quality=80"),
    beeldKey("https://www.voorbeeld.nl/foto-600x338.jpg?width=600"),
  );
});

t("beterBeeld normaliseert gecodeerde Nu.nl-thumbnails", () => {
  assert.equal(
    beterBeeld(" https://images.nu.nl/m/abc123_sqr256/foto.jpg?x&#x3D;1&amp;y&#61;2 "),
    "https://images.nu.nl/m/abc123_wd1280.jpg",
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
  assert.deepEqual(uniekeBeelden(urls), ["https://nieuws.nl/foto-1200x675.jpg", "https://nieuws.nl/andere-foto.jpg"]);
  assert.deepEqual(uniekeBeelden(urls, 1), ["https://nieuws.nl/foto-1200x675.jpg"]);
});

t("ogImage leest een relatieve og:image ten opzichte van de basis-URL", () => {
  assert.equal(
    ogImage('<meta property="og:image" content="/beelden/foto.jpg?bron=a&amp;maat=breed">', "https://nieuws.nl/artikelen/123"),
    "https://nieuws.nl/beelden/foto.jpg?bron=a&maat=breed",
  );
});

console.log(`\n${n} tests geslaagd`);