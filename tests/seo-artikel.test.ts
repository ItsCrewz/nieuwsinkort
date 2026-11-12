// #779: artikelpagina's vindbaar: unieke beschrijving op woordgrens, NewsArticle met foto/publisher, verwante links, dynamische sitemap.xml.
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { artikelPad } from "../src/artikelid";
import { berichtHtml, beschrijving } from "../src/berichthtml";
import { onRequestGet, sitemap } from "../functions/sitemap.xml";
const sjabloon = readFileSync("index.html", "utf8"), dag = "2026-11-04", t0 = Date.parse("2026-11-04T10:00:00Z");
const lang = "Het kabinet neemt maatregelen tegen de stijgende energieprijzen en wil huishoudens met een laag inkomen extra steunen. Minister zegt dat dit snel moet gebeuren.";
const item = { kop: "Kabinet steunt huishoudens", ai: lang, samenvatting: "Meer uitleg", punten: ["Punt een"], cat: "nl", t: t0, beelden: ["https://images.nu.nl/a/b_wd1280.jpg"], bronnen: [{ site: "NU.nl", href: "https://nu.nl/x" }] };
const ander = { kop: "Ander nieuws", ai: "Tekst", cat: "nl", t: t0, bronnen: [{ site: "NOS", href: "https://nos.nl/y" }] };
assert.ok(beschrijving(lang).length <= 156 && beschrijving(lang).endsWith("…") && !beschrijving(lang).includes("Minister zegt dat dit snel moet gebeuren"), "knip op woordgrens");
assert.equal(beschrijving("Kort."), "Kort.");
for (const t of [lang, "a".repeat(300), "woord ".repeat(60), `${"x".repeat(150)} ${"y".repeat(30)}`]) assert.ok(beschrijving(t).length <= 155, "hooguit 155 tekens incl. …");
assert.ok(!beschrijving(`${"x".repeat(150)} ${"y".repeat(30)}`).includes("y"), "knip op spatie");
const kaal = berichtHtml(sjabloon, { kop: "Unieke kop zonder tekst", cat: "nl", bronnen: [{ site: "NOS", href: "https://nos.nl/z" }] }, dag);
assert.ok(kaal.includes('name="description" content="Unieke kop zonder tekst"'), "unieke description zonder ai/samenvatting");
assert.ok(berichtHtml(sjabloon, { kop: "K", cat: "nl", punten: ["Eerste punt"], bronnen: [] }, dag).includes('content="Eerste punt"'));
assert.ok(!berichtHtml(sjabloon, { kop: "Ruw", ruw: true, bronnen: [] }, dag).includes("Unieke"), "noindex houdt generieke zin");
const html = berichtHtml(sjabloon, item, dag, [ander]);
const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/)![1]);
assert.equal(ld.image[0], "https://nieuwsinkort.nl/media/beeld/images.nu.nl/a/b_wd1280.jpg");
assert.ok(ld.publisher.logo.url && ld.author.name && ld.datePublished && ld.dateModified && ld.headline);
assert.ok(html.includes('<meta property="og:image" content="https://nieuwsinkort.nl/media/beeld/images.nu.nl/a/b_wd1280.jpg"'));
assert.ok(!html.includes("og:image:width"), "geen 1200×630 bij artikelfoto");
assert.ok(html.includes(`href="${artikelPad(ander, dag)}"`) && html.includes('href="/vandaag"'), "interne links");
assert.ok(html.includes("<p>Meer uitleg</p>") && html.includes("<li>Punt een</li>"), "volledige tekst zonder JS");
const zonder = berichtHtml(sjabloon, { ...item, beelden: undefined }, dag);
assert.ok(zonder.includes("https://nieuwsinkort.nl/og-image.png"), "terugval op og-image");

const xml = sitemap([item, { ...ander, ruw: true }, { ...ander, cat: "politiek" }], dag, "2026-11-04T10:00:00.000Z");
assert.ok(xml.includes(`<loc>https://nieuwsinkort.nl${artikelPad(item, dag)}</loc><lastmod>2026-11-04T10:00:00.000Z</lastmod>`));
assert.equal((xml.match(/<url>/g) || []).length, 4, "3 vaste pagina's + 1 indexeerbaar artikel");
const dubbel = sitemap([{ ...item, id: "aaaaaaaa" }, { ...ander, id: "aaaaaaaa" }, { ...ander, id: "bbbbbbbb", kop: "Uniek" }], dag, "2026-11-04T10:00:00.000Z");
assert.ok(!dubbel.includes("aaaaaaaa") && dubbel.includes("bbbbbbbb"), "dubbele id's niet in sitemap");
const env = (gegenereerd: string) => ({ ASSETS: { fetch: async () => Response.json({}) }, NIEUWS: { get: async () => `${dag}\ntag\n${JSON.stringify({ gegenereerd, items: [item] })}` } });
const origineel = Date.now; Date.now = () => t0;
try {
  const r = await onRequestGet({ request: new Request("https://nieuwsinkort.nl/sitemap.xml"), env: env("2026-11-04T10:00:00Z"), waitUntil: () => {} });
  assert.equal(r.status, 200); assert.equal(r.headers.get("content-type"), "application/xml; charset=utf-8");
  assert.ok((await r.text()).includes(artikelPad(item, dag)));
  assert.match(r.headers.get("cache-control") || "", /max-age=\d+/);
  assert.ok(r.headers.get("X-Geldig-Tot"), "zelfde cachebeleid als news-sitemap");
} finally { Date.now = origineel; }
assert.ok(readFileSync("public/robots.txt", "utf8").includes("Sitemap: https://nieuwsinkort.nl/sitemap.xml"));
assert.ok(!JSON.parse(readFileSync("public/_routes.json", "utf8")).exclude.includes("/sitemap.xml"), "Function moet draaien");
console.log("✓ seo-artikel");
