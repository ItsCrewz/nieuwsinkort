import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { berichtHtml } from "../src/berichthtml";
import { sitemap } from "../functions/sitemap.xml";

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
  assert.equal(site.name, "Nieuws in het kort");
  assert.equal(site.url, "https://nieuwsinkort.nl/");
  assert.equal(org.name, "Nieuws in het kort");
  assert.equal(org.url, "https://nieuwsinkort.nl/");
  assert.equal(org.logo["@type"], "ImageObject");
  assert.equal(org.logo.url, "https://nieuwsinkort.nl/icon-512.png");
  assert.ok(!JSON.stringify(ld).includes("/over"), "geen verwijzing naar een nog niet bestaande pagina");
});
t("sitemap: apex met lastmod, zonder changefreq", () => {
  const s = sitemap([], "2026-11-04", "2026-11-04T10:00:00.000Z");
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
  assert.ok(!/vanzelf mee/.test(o) && /niet opnieuw gemaakt/.test(o), "bewaarde samenvattingen worden niet opnieuw gemaakt (docs/ai-budget.md)");
  assert.ok(!o.includes("@") && !o.includes("mailto"), "geen verzonnen contactadres");
  assert.match(readFileSync("src/App.tsx", "utf8"), /href="\/over"/);
  assert.match(sitemap([], "2026-11-04", "2026-11-04T10:00:00.000Z"), /<loc>https:\/\/nieuwsinkort\.nl\/over<\/loc>/);
});

const TITEL = "Nieuwsinkort - Het nieuws van vandaag samengevat";
const DESC = "Het belangrijkste nieuws in een paar zinnen, uit meerdere bronnen samengevat. Nederland, buitenland, sport, tech en AI.";
const controleer = (h: string) => {
  const k = h.slice(h.indexOf("<head>"), h.indexOf("</head>"));
  const m = (a: string, n: string) => k.match(new RegExp(`<meta ${a}="${n}" content="([^"]*)"`))?.[1];
  assert.equal(k.match(/<title>([^<]*)<\/title>/)?.[1], TITEL);
  assert.equal(m("property", "og:title"), TITEL);
  assert.equal(m("property", "og:site_name"), "Nieuws in het kort");
  assert.equal(m("name", "twitter:title"), TITEL);
  assert.equal(m("name", "description"), DESC);
  assert.equal(m("property", "og:description"), DESC);
  assert.equal(m("name", "twitter:description"), DESC);
};
t("homepage: exacte title en description in index.html (#598)", () => controleer(html));
t("homepage: exacte title en description in dist/index.html (indien gebouwd)", () => { if (existsSync("dist/index.html")) controleer(readFileSync("dist/index.html", "utf8")); });
t("een gerenderde /bericht-pagina houdt een eigen, afwijkende title", () => {
  const h = berichtHtml(html, { kop: "Kabinet presenteert nieuw plan", ai: "Het kabinet heeft een plan." }, "2026-11-05");
  const titel = h.match(/<title>([^<]*)<\/title>/)![1];
  assert.equal(titel, "Kabinet presenteert nieuw plan – Nieuws in het kort");
  assert.notEqual(titel, TITEL);
  assert.match(h, /<meta property="og:site_name" content="Nieuws in het kort"\s*\/>/);
});
