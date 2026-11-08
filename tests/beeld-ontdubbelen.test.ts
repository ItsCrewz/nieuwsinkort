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

console.log(`\n${n} tests geslaagd`);
