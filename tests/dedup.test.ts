// Draai: npm run test  (bundelt met esbuild en draait met node)
import assert from "node:assert/strict";
import { dedupVideos, canonUrl, videoKeys, titleTokens } from "../src/dedup";
import { uniekeBeelden, beeldKey, goedBeeld, ogImage, beterBeeld as _bb, uniekeBeelden as _ub } from "../src/beeld";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { onRequestGet as dataGet } from "../functions/data.json";
import { onRequestGet as meerGet } from "../functions/meer";
import { onRequestGet as samGet, onRequestPost as samPost } from "../functions/samenvatting";
import { onRequest as dumpert } from "../functions/media/dumpert/[[path]]";
import { merge } from "../functions/data.json";
import { schoon } from "../src/schoon";
import { hostVan, isNL } from "../src/bronlink";
import { parseFeed } from "../worker/src/parse";
import { onRequestPost as svPost } from "../functions/samenvatting";
import { videoSlug } from "../src/slug";

import { externeUrl, externeFetch } from "../worker/src/url";

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log("✓", name); };

t("bronlinks: ongeldige en relatieve links zijn geen Nederlandse bron", () => {
  for (const href of ["/relatief", "rommel", "www.site.nl/a", "javascript:x", "", "https://nos.nl.evil.com/a", "https://example.com/nos.nl/a"]) {
    assert.equal(isNL({ c: [{ href }] }), false, href);
  }
  assert.equal(hostVan("/relatief"), "");
  assert.equal(hostVan("rommel"), "");
  assert.equal(hostVan("javascript:x"), "");
  assert.equal(hostVan("https://nos.nl/a"), "nos.nl");
  assert.equal(isNL({ c: [{ href: "https://nos.nl/a" }] }), true);
});

t("bronlinks: fallback zonder AI gaat door na een ongeldige bron", () => {
  const clusters = [
    { c: [{ href: "/relatief", s: "Feedtekst" }] },
    { c: [{ href: "rommel", s: "Feedtekst" }, { href: "https://nos.nl/a", s: "Nieuws" }] },
  ];
  const noAI = true;
  const shown = clusters.filter((k) => noAI && isNL(k) && k.c[0].s);
  assert.deepEqual(shown, [clusters[1]]);
  assert.equal(isNL({ c: [] }), false);
});

t("externe URL: schema, poort en host controleren", () => {
  for (const h of ["http://127.0.0.1/", "http://localhost:8787/", "https://x.nl:8443/", "javascript:x", "/relatief", "http://[::1]/", "http://2130706433/", "http://0x7f000001/", "https://host.local/", "https://host.internal/", "http://localhost./", "http://sub.localhost/"]) assert.equal(externeUrl(h), null, h);
  for (const h of ["https://nos.nl/artikel/1", "http://nos.nl:80/", "https://nos.nl:443/"]) assert.equal(externeUrl(h), new URL(h).toString(), h);
});

// Geen netwerk: controleer dat ongeldige invoer niet wordt opgehaald en redirects worden verworpen.
{
  const origineel = globalThis.fetch;
  let calls = 0, geannuleerd = false;
  try {
    globalThis.fetch = async (_url, init) => {
      calls++;
      assert.equal(init?.redirect, "follow");
      const r = new Response(new ReadableStream({ cancel() { geannuleerd = true; } }));
      Object.defineProperty(r, "url", { value: "http://127.0.0.1/" });
      return r;
    };
    await assert.rejects(externeFetch("http://localhost/", {}), /geweigerde externe URL/);
    t("geweigerde URL doet geen fetch", () => assert.equal(calls, 0));
    await assert.rejects(externeFetch("https://nos.nl/artikel/1", {}), /geweigerde redirect-URL/);
    t("geweigerde redirect levert geen resultaat op en sluit de body", () => {
      assert.equal(calls, 1);
      assert.equal(geannuleerd, true);
    });
    globalThis.fetch = async () => {
      const r = new Response("artikel");
      Object.defineProperty(r, "url", { value: "https://nos.nl/artikel/2" });
      return r;
    };
    const r = await externeFetch("https://nos.nl/artikel/1", {});
    const tekst = await r.text();
    t("toegestane redirect behoudt het resultaat", () => assert.equal(tekst, "artikel"));
  } finally { globalThis.fetch = origineel; }
}

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

t("parseFeed: javascript:-link (ook als entity) wordt leeg, relatieve link absoluut", () => {
  const rss = (l: string) => `<rss><channel><item><title>x</title><link>${l}</link></item></channel></rss>`;
  assert.equal(parseFeed(rss("javascript:alert(1)"), "https://x.nl/rss")[0].l, "");
  assert.equal(parseFeed(rss("&#106;avascript:alert(1)"), "https://x.nl/rss")[0].l, "");
  assert.equal(parseFeed(rss("/nieuws/1"), "https://x.nl/rss")[0].l, "https://x.nl/nieuws/1");
  assert.equal(parseFeed(JSON.stringify([{ title: "a", url: "javascript:alert(1)" }]), "https://x.nl/api")[0].l, "https://x.nl/api");
});

t("schoon: bronnen met niet-http(s) href vallen weg", () => {
  const r = schoon({ items: [{ bronnen: [{ naam: "a", href: "javascript:alert(1)" }, { naam: "b", href: "https://x.nl/b" }, { naam: "c" }] }] });
  assert.deepEqual(r.items[0].bronnen.map((b: any) => b.naam), ["b"]);
});

t("CSP staat alleen het exacte thema-script en de benodigde mediabronnen toe", () => {
  const html = readFileSync("index.html", "utf8");
  const headers = readFileSync("public/_headers", "utf8");
  const script = /<script>([\s\S]*?)<\/script>/.exec(html)![1];
  const hash = createHash("sha256").update(script).digest("base64");
  const csp = /Content-Security-Policy: (.+)/.exec(headers)![1];
  const regels = new Map(csp.split("; ").map((r) => { const [k, ...v] = r.split(" "); return [k, v.join(" ")]; }));
  assert.equal(regels.get("script-src"), "'self' 'sha256-" + hash + "'");
  for (const [k, v] of Object.entries({
    "default-src": "'self'", "style-src": "'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src": "https://fonts.gstatic.com", "img-src": "'self' https: data:",
    "media-src": "'self' https: blob:", "connect-src": "'self' https:",
    "frame-src": "https://www.youtube-nocookie.com", "worker-src": "'self' blob:",
    "object-src": "'none'", "base-uri": "'self'", "form-action": "'none'", "frame-ancestors": "'none'",
  })) assert.equal(regels.get(k), v, k);
  assert.match(headers, /X-Frame-Options: DENY/);
  assert.match(headers, /Permissions-Policy: camera=\(\), microphone=\(\), geolocation=\(\), payment=\(\), usb=\(\)/);
  assert.ok(!headers.includes("/data.json"));
});

const req = (pad: string) => new Request("https://voorbeeld.test" + pad);
const assets = { fetch: async () => Response.json({ items: [], filmpjes: [], dumpert: [] }) };
const kv = { get: async () => null, put: async () => {} };
const antwoorden = [
  await dataGet({ request: req("/data.json"), env: { ASSETS: assets } }),
  await dataGet({ request: req("/data.json"), env: { ASSETS: assets, NIEUWS: kv } }),
  await dataGet({ request: req("/data.json?statisch=1"), env: { ASSETS: assets, NIEUWS: kv } }),
  await dataGet({ request: req("/data.json"), env: { ASSETS: { fetch: async () => new Response("{}", { status: 404 }) } } }),
  await meerGet({ request: req("/meer"), env: {} }),
  await meerGet({ request: req("/meer?k=test"), env: { NIEUWS: kv } }),
  await meerGet({ request: req("/meer?k=test"), env: { NIEUWS: { get: async () => ({ items: { test: { uitleg: ["tekst"] } } }) } } }),
  await samGet({ request: req("/samenvatting"), env: { NIEUWS: kv, ASSETS: assets, AI: {} } }),
  await samPost({ request: new Request("https://voorbeeld.test/samenvatting", { method: "POST", body: "{}" }), env: { NIEUWS: kv, ASSETS: assets, AI: {} } }),
  await dumpert({ request: req("/media/dumpert/ongeldig"), params: { path: "ongeldig" } }),
  await dumpert({ request: new Request("https://voorbeeld.test/media/dumpert/x", { method: "POST" }), params: {} }),
];
const origineelFetch = globalThis.fetch;
try {
  globalThis.fetch = async () => new Response("media", { headers: { "Content-Type": "video/mp2t" } });
  antwoorden.push(await dumpert({ request: req("/media/dumpert/x"), params: { path: "dmp/media/video/abc/123.ts" } }));
  globalThis.fetch = async () => new Response("fout", { status: 502 });
  antwoorden.push(await dumpert({ request: req("/media/dumpert/x"), params: { path: "dmp/media/video/abc/123.ts" } }));
} finally { globalThis.fetch = origineelFetch; }
t("alle vier Functions zetten nosniff bij succes, terugval en fouten zonder netwerk of AI", () => {
  assert.deepEqual(antwoorden.map((r) => r.status), [200, 200, 200, 404, 400, 404, 200, 400, 415, 404, 405, 200, 502]);
  for (const r of antwoorden) assert.equal(r.headers.get("X-Content-Type-Options"), "nosniff");
});
// ---- /samenvatting: slot, cache van fouten, headers, geen `why` (mock-KV en mock-AI)
const svOmgeving = () => {
  const m = new Map<string, string>(), schrijf: string[] = [];
  const video = { titel: "Testfilmpje", href: "https://x.com/a/status/1", embed: "https://video.twimg.com/a.mp4", bron: "X" };
  m.set("uur", JSON.stringify({ filmpjes: [video], dumpert: [] }));
  const calls: string[] = [];
  const env: any = {
    NIEUWS: {
      get: async (k: string, ty?: string) => { await 0; const v = m.get(k); return v == null ? null : ty === "json" ? JSON.parse(v) : v; },
      put: async (k: string, v: string) => { await 0; schrijf.push(k); m.set(k, v); },
      delete: async (k: string) => { m.delete(k); },
    },
    ASSETS: { fetch: async () => new Response("{}") },
    AI: { run: async (model: string) => { calls.push(model); await new Promise((r) => setTimeout(r, 5)); return model.includes("whisper") ? { text: "dit is een lange gesproken tekst over het nieuws van vandaag", transcription_info: { duration: 60 } } : { response: "", usage: { prompt_tokens: 10, completion_tokens: 1 } }; } },
  };
  const post = (o: any = {}, h: Record<string, string> = { "Content-Type": "application/json" }) =>
    svPost({ request: new Request("https://nieuwsinkort.test/samenvatting", { method: "POST", headers: h, body: JSON.stringify({ id: videoSlug(video as any), ...o }) }), env });
  return { env, m, schrijf, calls, post };
};
{
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(new Uint8Array(2e6), { status: 200 })) as any;
  try {
    const a = svOmgeving();
    const rs = await Promise.all(Array.from({ length: 20 }, () => a.post()));
    assert.equal(a.calls.filter((c) => c.includes("whisper")).length, 1, "20 gelijktijdige POST's: hooguit 1 Whisper-aanroep");
    const js: any[] = await Promise.all(rs.map((r) => r.json()));
    assert.ok(js.every((j) => !("why" in j)), "geen why naar de client");
    assert.ok(js.filter((j) => j.code === "bezig").length >= 19);
    const n = a.calls.length;
    const tweede: any = await (await a.post()).json();
    assert.equal(tweede.cached, true);
    assert.equal(tweede.code, "fout");
    assert.equal(a.calls.length, n, "fout-uitkomst gecachet: geen nieuwe AI-aanroep");
    assert.ok(a.m.has("vs-uur:" + Object.keys(Object.fromEntries(a.m)).find((k) => k.startsWith("vs-uur:"))?.slice(7)), "uurteller gezet");
    assert.ok(+a.m.get(Object.keys(Object.fromEntries(a.m)).find((k) => k.startsWith("vid-neurons:"))!)! > 0, "neuronen verrekend");

    const b = svOmgeving();
    const pre: any = await (await b.post({ pre: true })).json();
    assert.ok(Array.isArray(pre.why), "pre:true krijgt why wel");

    // uurrem: bij een volle teller geen AI
    const c = svOmgeving();
    const d = new Date(); const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(d).map((x) => [x.type, x.value]));
    c.m.set(`vs-uur:${p.year}-${p.month}-${p.day}T${+p.hour}`, "30");
    const vol: any = await (await c.post()).json();
    assert.equal(vol.code, "druk");
    assert.equal(c.calls.length, 0);
  } finally { globalThis.fetch = realFetch; }

  for (const [h, status] of [[{ "Content-Type": "text/plain" }, 415], [{}, 415], [{ "Content-Type": "application/json", Origin: "https://evil.example" }, 403]] as const) {
    const e = svOmgeving();
    const r = await e.post({}, h as any);
    assert.equal(r.status, status);
    assert.equal(e.schrijf.length, 0, "geen KV-schrijf");
    assert.equal(e.calls.length, 0, "geen AI-aanroep");
  }
  const ok = svOmgeving();
  assert.notEqual((await ok.post({}, { "Content-Type": "application/json", Origin: "https://nieuwsinkort.test" })).status, 403);
  n++; console.log("✓ samenvatting: slot, foutcache, 415/403, uurrem, geen why");
}

console.log(`\n${n} tests geslaagd`);
