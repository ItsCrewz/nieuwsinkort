// Draai: npm test  (beeld-URL's en og:image, src/beeld.ts)
import assert from "node:assert/strict";
import { beeldKey, beterBeeld, goedBeeld, ogImage, schermBeeld, uniekeBeelden } from "../src/beeld";

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

t("schermBeeld verkleint alleen bekende CDN-parameters en vergroot nooit", () => {
  assert.equal(schermBeeld("https://redactie.rtl.nl/a.png?itok=x&width=1024&height=576&impolicy=semi_dynamic"), "https://redactie.rtl.nl/a.png?itok=x&width=800&height=450&impolicy=semi_dynamic");
  assert.equal(schermBeeld("https://techcrunch.com/a.jpg?resize=1200,867"), "https://techcrunch.com/a.jpg?resize=800,578");
  assert.equal(schermBeeld("https://images.nrc.nl/k=/1280x/filters:no_upscale()/s3/a.jpg"), "https://images.nrc.nl/k=/800x/filters:no_upscale()/s3/a.jpg");
  assert.equal(schermBeeld("https://blogger.googleusercontent.com/img/b/x/s1600/a.jpg"), "https://blogger.googleusercontent.com/img/b/x/s800/a.jpg");
  assert.equal(schermBeeld("https://images.nu.nl/m/abc_wd1280.jpg"), "https://images.nu.nl/m/abc_wd640.jpg");
  assert.equal(schermBeeld("https://redactie.rtl.nl/a.png?width=600&height=300"), "https://redactie.rtl.nl/a.png?width=600&height=300");
  assert.equal(schermBeeld("https://onbekend.nl/a.jpg?width=2000"), "https://onbekend.nl/a.jpg?width=2000");
  assert.equal(schermBeeld("geen url"), "geen url");
});

console.log(`\n${n} tests geslaagd`);