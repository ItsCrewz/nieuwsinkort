// Draai: npm run test  (bundelt met esbuild en draait met node)
import assert from "node:assert/strict";
import { dedupVideos, canonUrl, videoKeys, titleTokens } from "../src/dedup";
import { uniekeBeelden, beeldKey, goedBeeld, ogImage, beterBeeld as _bb, uniekeBeelden as _ub } from "../src/beeld";
import { merge } from "../functions/data.json";
import { schoon } from "../src/schoon";

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log("✓", name); };

t("tracking-parameters weg", () => {
  assert.equal(canonUrl("https://www.youtube.com/shorts/abcdefghijk?si=XYZ&feature=share"), "youtube.com/shorts/abcdefghijk");
  assert.equal(canonUrl("https://twitter.com/NOS/status/123?s=20&t=abc"), "x.com/NOS/status/123?t=abc");
  assert.equal(canonUrl("https://www.instagram.com/reel/C0de123/?igsh=MWQ1&utm_source=ig_web"), "instagram.com/reel/C0de123");
});

t("zelfde YouTube-id in shorts/watch/embed/youtu.be", () => {
  const ids = ["https://www.youtube.com/shorts/dQw4w9WgXcQ", "https://youtu.be/dQw4w9WgXcQ?si=1", "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"];
  for (const h of ids) assert.ok(videoKeys({ titel: "x", href: h, bron: "YouTube" }).includes("yt:dQw4w9WgXcQ"), h);
  const r = dedupVideos(ids.map((href, i) => ({ titel: `Titel ${i}`, href, bron: "YouTube" })));
  assert.equal(r.list.length, 1);
  assert.equal(r.removed, 3);
});

t("Instagram p/ en reel/ zelfde shortcode", () => {
  const r = dedupVideos([
    { titel: "Reel A", href: "https://www.instagram.com/reel/ABC123xyz/", bron: "Instagram", embed: "https://scontent.cdninstagram.com/v/t66/abc.mp4?oe=1" },
    { titel: "Andere titel", href: "https://instagram.com/p/ABC123xyz/?igsh=1", bron: "Instagram" },
  ]);
  assert.equal(r.list.length, 1);
});

t("zelfde clip op twee platforms via bijna-gelijke titel; beste (afspeelbaar) blijft, ander in 'ook'", () => {
  const r = dedupVideos([
    { titel: "Brand in Haarlemse binnenstad: brandweer rukt groots uit #nieuws", href: "https://www.instagram.com/reel/QQQ111/", bron: "Instagram", embed: "https://x.cdninstagram.com/v.mp4?oe=1", populariteit: "120 likes" },
    { titel: "Brand in Haarlemse binnenstad, brandweer rukt groots uit | NH Nieuws", href: "https://www.youtube.com/shorts/aaaaaaaaaaa", bron: "YouTube", embed: "https://www.youtube.com/embed/aaaaaaaaaaa", populariteit: "5,1k views" },
  ]);
  assert.equal(r.list.length, 1);
  assert.equal(r.list[0].bron, "YouTube");
  assert.deepEqual(r.list[0].ook, [{ bron: "Instagram", href: "https://www.instagram.com/reel/QQQ111/" }]);
});

t("verschillende filmpjes blijven", () => {
  const r = dedupVideos([
    { titel: "Kabinet presenteert plannen voor woningbouw in 2027", href: "https://youtu.be/aaaaaaaaaa1", bron: "YouTube" },
    { titel: "Ajax verliest van PSV in spannende topper", href: "https://youtu.be/aaaaaaaaaa2", bron: "YouTube" },
    { titel: "Kat", href: "https://v.redd.it/abc", bron: "Reddit" },
    { titel: "Kat", href: "https://v.redd.it/def", bron: "Reddit" }, // korte gelijke titel ≠ zelfde filmpje
  ]);
  assert.equal(r.list.length, 4);
});

t("filmpje dat al bij Dumpert staat valt uit Filmpjes", () => {
  const d = [{ titel: "Gozer valt van fiets", href: "https://www.dumpert.nl/item/100_abc", bron: "Dumpert" }];
  const r = dedupVideos([{ titel: "Iets", href: "https://dumpert.nl/item/100_abc?ref=x", bron: "Reddit" }, { titel: "Anders", href: "https://youtu.be/bbbbbbbbbbb", bron: "YouTube" }], d);
  assert.equal(r.list.length, 1);
  assert.equal(r.list[0].bron, "YouTube");
});

t("X-status en mp4-pad zonder query", () => {
  const r = dedupVideos([
    { titel: "a", href: "https://x.com/NOS/status/1850000000000000000", bron: "X" },
    { titel: "b", href: "https://twitter.com/NOS/status/1850000000000000000?s=46", bron: "X" },
    { titel: "c", href: "https://site/1", embed: "https://video.twimg.com/amplify_video/123/vid/720x1280/x.mp4?tag=14", bron: "X" },
    { titel: "d", href: "https://site/2", embed: "https://video.twimg.com/amplify_video/123/vid/720x1280/x.mp4?tag=16", bron: "X" },
  ]);
  assert.equal(r.list.length, 2);
});

t("titel-tokens: bron-achtervoegsel, hashtags, emoji weg", () => {
  assert.deepEqual(titleTokens("Storm raast over Nederland 🌪️ #storm | RTL Nieuws"), ["storm", "raast", "nederland"]);
});

t("foto's: zelfde foto in andere maat/query = dubbel; logo's/kleine weg", () => {
  const u = uniekeBeelden([
    "https://media.nu.nl/m/abc123_wd1280.jpg?width=1200",
    "https://media.nu.nl/m/abc123_wd1280.jpg?width=640",
    "https://cdn.nos.nl/image/2026/10/28/1234/1200x675a.jpg",
    "https://cdn.nos.nl/image/2026/10/28/1234/2048x1152a.jpg",
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
    "https://cdn.nos.nl/image/2026/10/28/1234/1200x675a.jpg",
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

t("merge + schoon: uur-filmpjes en statische filmpjes ontdubbeld, foto's per bericht uniek", () => {
  const now = new Date().toISOString();
  const S = { gegenereerd: new Date(Date.now() - 3600e3).toISOString(), items: [{ cat: "nl", kop: "A", bronnen: [{ site: "NOS", href: "https://nos.nl/1" }], beeld: "https://cdn.nos.nl/a-1200x675.jpg", beelden: ["https://cdn.nos.nl/a-600x338.jpg"] }],
    filmpjes: [{ titel: "Zelfde clip over de storm in Haarlem vandaag", href: "https://www.youtube.com/shorts/ccccccccccc", bron: "YouTube", tijd: "07:00" }], dumpert: [] };
  const H = { gegenereerd: now, items: [], dumpert: [], meta: { aiStand: "zuinig" },
    filmpjes: [{ titel: "Zelfde clip over de storm in Haarlem vandaag!", href: "https://www.instagram.com/reel/ZZZ/", bron: "Instagram", embed: "https://x/v.mp4", tijd: "23:59" },
      { titel: "x", href: "https://youtu.be/ccccccccccc?si=2", bron: "YouTube", tijd: "23:59" }] };
  const out = schoon(merge(S, H));
  assert.equal(out.filmpjes.length, 1, JSON.stringify(out.filmpjes));
  assert.equal(out.items[0].beelden.length, 1);
  assert.equal(out.uur.ai, "zuinig");
  assert.equal(out.ontdubbeld.filmpjes, 2);
});

t("beelden: NU.nl-thumbnail groter, entities, youtube-link weg", () => {
  assert.equal(_bb("https://images.nu.nl/m/yevxzeda0kby_sqr256/696/0/1080/1080/jetten.jpg"), "https://images.nu.nl/m/yevxzeda0kby_wd1280.jpg");
  assert.equal(_bb("https://images.fd.nl/a.jpeg?fit&#x3D;crop&amp;w&#x3D;900"), "https://images.fd.nl/a.jpeg?fit=crop&w=900");
  assert.equal(_ub(["https://www.youtube.com/v/PX1W02kWuJo?version=3"]).length, 0);
});

console.log(`\n${n} tests geslaagd`);
