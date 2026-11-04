import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const t = (naam: string, f: () => void) => { f(); console.log(`✓ ${naam}`); };
const html = readFileSync("index.html", "utf8");
const head = html.slice(html.indexOf("<head>"), html.indexOf("</head>"));
const meta = (attr: string, naam: string) => [...head.matchAll(new RegExp(`<meta ${attr}="${naam}" content="([^"]*)"`, "g"))].map((m) => m[1]);

t("precies één canonical, title en description; canonical = og:url", () => {
  const canon = [...head.matchAll(/<link rel="canonical" href="([^"]*)"/g)].map((m) => m[1]);
  assert.deepEqual(canon, ["https://nieuwsinkort.nl/"]);
  assert.equal(head.match(/<title>/g)?.length, 1);
  assert.equal(meta("name", "description").length, 1);
  assert.deepEqual(meta("property", "og:url"), canon);
});
t("OG- en Twitter-description zijn gelijk aan de meta description", () => {
  const d = meta("name", "description")[0];
  assert.match(d, /Buitenland/);
  assert.match(d, /Sport/);
  assert.deepEqual(meta("property", "og:description"), [d]);
  assert.deepEqual(meta("name", "twitter:description"), [d]);
  assert.deepEqual(meta("property", "og:title"), meta("name", "twitter:title"));
});
t("JSON-LD is geldige JSON met verplichte velden", () => {
  const blokken = [...head.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  assert.equal(blokken.length, 1);
  const ld = JSON.parse(blokken[0][1]);
  assert.equal(ld["@context"], "https://schema.org");
  const per = (type: string) => ld["@graph"].find((n: any) => n["@type"] === type);
  const site = per("WebSite"), org = per("NewsMediaOrganization");
  assert.equal(site.url, "https://nieuwsinkort.nl/");
  assert.equal(org.name, "Nieuws in het kort");
  assert.equal(org.url, "https://nieuwsinkort.nl/");
  assert.equal(org.logo["@type"], "ImageObject");
  assert.equal(org.logo.url, "https://nieuwsinkort.nl/icon-512.png");
  assert.ok(!JSON.stringify(ld).includes("/over"), "geen verwijzing naar een nog niet bestaande pagina");
});
t("sitemap: apex met lastmod, zonder changefreq", () => {
  const s = readFileSync("public/sitemap.xml", "utf8");
  assert.match(s, /<loc>https:\/\/nieuwsinkort\.nl\/<\/loc>/);
  assert.match(s, /<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
  assert.ok(!s.includes("changefreq"));
});
await t("JSON-LD: inLanguage alleen op WebSite, niet op NewsMediaOrganization", () => {
  const ld = JSON.parse(readFileSync("index.html", "utf8").match(/ld\+json">([\s\S]*?)<\/script>/)![1]);
  for (const n of ld["@graph"]) assert.equal("inLanguage" in n, n["@type"] === "WebSite", n["@type"]);
});
t("/over: statische pagina met lang, canonical, title, description en één h1; geen script", () => {
  const o = readFileSync("public/over.html", "utf8");
  assert.match(o, /<html lang="nl">/);
  assert.deepEqual([...o.matchAll(/<link rel="canonical" href="([^"]*)"/g)].map((m) => m[1]), ["https://nieuwsinkort.nl/over"]);
  assert.equal(o.match(/<title>/g)?.length, 1);
  assert.equal(o.match(/<meta name="description"/g)?.length, 1);
  assert.equal(o.match(/<h1>/g)?.length, 1);
  assert.ok(!o.includes("<script"), "geen inline script (CSP)");
  assert.ok(o.includes('href="/bronnen.json"'));
  assert.ok(!o.includes("@") && !o.includes("mailto"), "geen verzonnen contactadres");
  assert.match(readFileSync("src/App.tsx", "utf8"), /href="\/over"/);
  assert.match(readFileSync("public/sitemap.xml", "utf8"), /<loc>https:\/\/nieuwsinkort\.nl\/over<\/loc>/);
});
