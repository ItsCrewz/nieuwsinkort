// Draai: npm run test  (bundelt met esbuild en draait met node)
import assert from "node:assert/strict";
import { uniekeBeelden, beeldKey, goedBeeld, ogImage, beterBeeld as _bb, uniekeBeelden as _ub } from "../src/beeld";

let n = 0;
const t = (name: string, fn: () => void | Promise<void>) => {
  const klaar = () => { n++; console.log("✓", name); };
  const resultaat = fn();
  if (resultaat instanceof Promise) return resultaat.then(klaar);
  klaar();
};

t("foto's: zelfde foto in andere maat/query = dubbel; logo's/kleine weg", () => {
  const u = uniekeBeelden([
    "https://media.nu.nl/m/abc123_wd1280.jpg?width=1200",
    "https://media.nu.nl/m/abc123_wd1280.jpg?width=640",
    "https://cdn.nos.nl/image/2026-10-28/1234/1200x675a.jpg",
    "https://cdn.nos.nl/image/2026-10-28/1234/2048x1152a.jpg",
    "https://img.example.com/foto-1200x675.jpg",
    "https://img.example.com/foto-600x338.jpg",
    "https://site.nl/static/logo.png",
    "https://site.nl/i/plaatje.jpg?w=120",
    "https://site.nl/i/placeholder.jpg",
    "https://site.nl/i/anim.gif",
    null, "",
    "https://www.telegraaf.nl/images/1200x630/filters:quality(70)/cdn-kiosk-api.telegraaf.nl/aaa-bbb.jpg",
  ]);
  assert.deepEqual(u, [
    "https://media.nu.nl/m/abc123_wd1280.jpg?width=1200",
    "https://cdn.nos.nl/image/2026-10-28/1234/1200x675a.jpg",
    "https://img.example.com/foto-1200x675.jpg",
    "https://www.telegraaf.nl/images/1200x630/filters:quality(70)/cdn-kiosk-api.telegraaf.nl/aaa-bbb.jpg",
  ]);
  assert.ok(!goedBeeld("https://x.nl/a.svg"));
  assert.equal(beeldKey("https://i0.wp.com/site.nl/wp-content/uploads/foto-scaled.jpg?resize=1024"), beeldKey("https://site.nl/wp-content/uploads/foto-1024x576.jpg"));
});

t("og:image uit HTML (beide attribuutvolgordes)", () => {
  assert.equal(ogImage('<meta property="og:image" content="/a/b.jpg">', "https://nos.nl/artikel/1"), "https://nos.nl/a/b.jpg");
  assert.equal(ogImage('<meta content="https://x.nl/c.jpg" property="og:image" />', "https://x.nl"), "https://x.nl/c.jpg");
  assert.equal(ogImage("<title>x</title>", "https://x.nl"), "");
});

t("beelden: NU.nl-thumbnail groter, entities, youtube-link weg", () => {
  assert.equal(_bb("https://images.nu.nl/m/yevxzeda0kby_sqr256/696/0/1080/1080/jetten.jpg"), "https://images.nu.nl/m/yevxzeda0kby_wd1280.jpg");
  assert.equal(_bb("https://images.fd.nl/a.jpeg?fit&#x3D;crop&amp;w&#x3D;900"), "https://images.fd.nl/a.jpeg?fit=crop&w=900");
  assert.equal(_ub(["https://www.youtube.com/v/PX1W02kWuJo?version=3"]).length, 0);
});

t("zelfde bestandsnaam in andere artikelmap blijft behouden (#649)", () => {
  const a = "https://cdn.voorbeeld.nl/2026/11/artikel-a/persfoto-stadhuis.jpg";
  const b = "https://cdn.voorbeeld.nl/2026/11/artikel-b/persfoto-stadhuis.jpg";
  assert.notEqual(beeldKey(a), beeldKey(b));
  assert.deepEqual(uniekeBeelden([a, b]), [a, b]);
  assert.equal(uniekeBeelden([a, b], 1).length, 1);
  // dezelfde foto in twee maatmappen blijft één foto
  assert.equal(beeldKey("https://cdn.voorbeeld.nl/2026/11/artikel-a/1200x675/persfoto-stadhuis.jpg"), beeldKey("https://www.voorbeeld.nl/2026/11/artikel-a/600x338/persfoto-stadhuis.jpg"));
  assert.equal(beeldKey("https://res.cloudinary.com/x/image/upload/w_800,h_450,c_fill/v1/abc/persfoto.jpg"), beeldKey("https://res.cloudinary.com/x/image/upload/w_1200,h_675,c_fill/v1/abc/persfoto.jpg"));
  // NOS: maat als bestandsnaam, id in de map
  assert.notEqual(beeldKey("https://cdn.nos.nl/image/2026-10-28/1234/1200x675a.jpg"), beeldKey("https://cdn.nos.nl/image/2026-10-28/5678/1200x675a.jpg"));
});

t("maatmappen: ruime herkenning, maar geen echte mappen (#649)", () => {
  const k = (u: string) => beeldKey(u);
  // id_123 is geen transformatie
  assert.notEqual(k("https://cdn.voorbeeld.nl/media/id_123/foto.jpg"), k("https://cdn.voorbeeld.nl/media/id_456/foto.jpg"));
  assert.notEqual(k("https://cdn.voorbeeld.nl/media/img_55/foto.jpg"), k("https://cdn.voorbeeld.nl/media/wp_x/foto.jpg"));
  // numerieke en overige maatmappen blijven samengevoegd
  assert.equal(k("https://cdn.voorbeeld.nl/a/640/foto.jpg"), k("https://cdn.voorbeeld.nl/a/1280/foto.jpg"));
  assert.equal(k("https://cdn.voorbeeld.nl/a/w/800/foto.jpg"), k("https://cdn.voorbeeld.nl/a/w/400/foto.jpg"));
  assert.equal(k("https://cdn.voorbeeld.nl/a/resize/q80/foto.jpg"), k("https://cdn.voorbeeld.nl/a/foto.jpg"));
  assert.equal(k("https://cdn.voorbeeld.nl/a/s640-c/foto.jpg"), k("https://cdn.voorbeeld.nl/a/thumb/foto.jpg"));
  assert.equal(k("https://cdn.voorbeeld.nl/a/large/foto.jpg"), k("https://cdn.voorbeeld.nl/a/medium/foto.jpg"));
  // jaar-/maandmappen en hoofdletters
  assert.notEqual(k("https://x.nl/uploads/2026/10/foto.jpg"), k("https://x.nl/uploads/2025/10/foto.jpg"));
  assert.equal(k("https://x.nl/Artikel-A/foto.jpg"), k("https://x.nl/artikel-a/foto.jpg"));
  // generieke bestandsnamen in verschillende mappen
  assert.notEqual(k("https://x.nl/a/image.jpg"), k("https://x.nl/b/image.jpg"));
  assert.notEqual(k("https://x.nl/a/1.jpg"), k("https://x.nl/b/1.jpg"));
  // proxy en wp.com
  assert.equal(k("https://proxy.nl/img?url=" + encodeURIComponent("https://x.nl/a/640/foto.jpg")), k("https://x.nl/a/foto.jpg"));
  assert.equal(k("https://i1.wp.com/x.nl/wp-content/uploads/2026/10/foto.jpg?w=300"), k("https://x.nl/wp-content/uploads/2026/10/foto-300x200.jpg"));
  // geen backtracking-explosie
  const t0 = Date.now(); k("https://x.nl/" + "a_".repeat(40) + ",,/foto.jpg"); assert.ok(Date.now() - t0 < 200);
});

console.log(`\n${n} tests geslaagd`);
