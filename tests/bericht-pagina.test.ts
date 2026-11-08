import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { artikelPad } from "../src/artikelid";
import { berichtHtml } from "../src/berichthtml";
import { onRequestGet } from "../functions/bericht/[[pad]]";
const sjabloon = readFileSync("index.html", "utf8");
const csp = /Content-Security-Policy: (.+)/.exec(readFileSync("public/_headers", "utf8"))![1]; // echte CSP: de pagina draait onder dezelfde hash als de app
const origineel = Date.now;
Date.now = () => Date.parse("2026-11-04T12:00:00Z");
try {
  const item = { beelden: ["https://images.pubble.cloud/worker/jpg/quick/1920/2229725/648e3015/content/2026/11/1d8096c1-467a-4ef5-917b-d970306e659c"], kop: "Nieuws <script>", ai: "Een eigen samenvatting", samenvatting: "Meer nieuws", t: Date.now(), bronnen: [{ site: "Bron <script>", href: "https://bron.nl/a" }, { site: "kwaad", href: "javascript:alert(1)" }] };
  const dag = "2026-11-04", pad = artikelPad(item, dag), html = berichtHtml(sjabloon, item, dag);
  assert.ok(html.includes("&lt;script&gt;")); assert.ok(!html.includes("javascript:alert"));
  assert.ok(html.includes(`https://nieuwsinkort.nl${pad}`)); assert.ok(html.includes('property="og:image"'));
  const gevaarlijkeKop = 'Nieuws </script> "geciteerd" ' + "x".repeat(110);
  const fixtureHtml = berichtHtml(sjabloon, { ...item, kop: gevaarlijkeKop }, dag);
  const blokken = [...fixtureHtml.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  assert.equal(blokken.length, 1);
  const json = JSON.parse(blokken[0][1]);
  assert.equal(json["@context"], "https://schema.org"); assert.equal(json["@type"], "NewsArticle");
  assert.equal(json.headline, gevaarlijkeKop.slice(0, 110)); assert.ok(json.headline.length <= 110);
  for (const datum of [json.datePublished, json.dateModified]) {
    assert.match(datum, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/);
    assert.ok(Number.isFinite(Date.parse(datum)));
  }
  assert.equal(json.mainEntityOfPage, `https://nieuwsinkort.nl${artikelPad({ ...item, kop: gevaarlijkeKop }, dag)}`);
  assert.equal(json.inLanguage, "nl-NL"); assert.equal(new URL(json.image).protocol, "https:");
  const indexJson = JSON.parse(sjabloon.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)![1]);
  assert.deepEqual(json.publisher, indexJson["@graph"].find((x: { "@type": string }) => x["@type"] === "NewsMediaOrganization"));
  let reads = 0;
  const env = { ASSETS: { fetch: async (r: Request | string) => String((r as Request).url ?? r).endsWith("/data.json") ? Response.json({}) : new Response(sjabloon, { headers: { "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": csp } }) }, NIEUWS: { get: async () => { reads++; return `${dag}\ntag\n${JSON.stringify({ gegenereerd: new Date(Date.now()).toISOString(), items: [item] })}`; } } };
  const bezoek = (path: string) => onRequestGet({ request: new Request(`https://nieuwsinkort.nl${path}`), env, waitUntil: () => {} });
  let r = await bezoek(pad); assert.equal(r.status, 200); assert.equal(reads, 1);
  const controleerMeta = (html: string, afbeelding: string) => {
    const tags = [...html.matchAll(/<meta\s+(property|name)="([^"]+)"\s+content="([^"]*)"\s*\/>/g)];
    const waarde = (naam: string) => { const gevonden = tags.filter((m) => m[2] === naam); assert.equal(gevonden.length, 1, naam); return gevonden[0][3]; };
    assert.equal(waarde("og:title"), "Nieuws &lt;script&gt;");
    assert.equal(waarde("og:description"), "Een eigen samenvatting");
    assert.equal(waarde("og:url"), `https://nieuwsinkort.nl${pad}`);
    assert.equal(waarde("og:type"), "article");
    assert.equal(waarde("og:site_name"), "Nieuws in het kort");
    assert.equal(waarde("twitter:card"), "summary_large_image");
    assert.equal(waarde("og:image"), afbeelding); assert.equal(waarde("twitter:image"), afbeelding);
    for (const naam of ["og:url", "og:image", "twitter:image"]) assert.equal(new URL(waarde(naam)).protocol, "https:");
    assert.ok(html.includes(`<link rel="canonical" href="https://nieuwsinkort.nl${pad}"`));
  };
  controleerMeta(await r.clone().text(), "https://nieuwsinkort.nl/media/beeld/images.pubble.cloud/worker/jpg/quick/1200/2229725/648e3015/content/2026/11/1d8096c1-467a-4ef5-917b-d970306e659c");
  controleerMeta(berichtHtml(sjabloon, { ...item, beelden: [] }, dag), "https://nieuwsinkort.nl/og-image.png");
  assert.ok(r.headers.get("content-security-policy")?.includes("default-src"));
  assert.ok((await r.clone().text()).includes('<div id="root"><article><h1>Nieuws &lt;script&gt;</h1>'), "de app-HTML met kop-tags en crawlertekst in #root");
  r = await bezoek(pad.replace(/nieuws-script$/, "anders")); assert.equal(r.status, 301); assert.equal(r.headers.get("location"), pad); assert.equal(r.headers.get("cache-control"), "no-store");
  r = await bezoek(`/bericht/${dag}/aaaaaaaa-onbekend`); assert.equal(r.status, 302); assert.equal(r.headers.get("cache-control"), "no-store");
  reads = 0; r = await bezoek("/bericht/2026-11-02/aaaaaaaa-oud"); assert.equal(r.status, 301); assert.equal(reads, 0);
  r = await bezoek("/bericht/2026-11-05/aaaaaaaa-toekomst"); assert.equal(r.status, 404);
  // #832: afgebroken sjabloonbody (of mislukte fetch) geeft een tijdelijke terugval met query; na herstel slaagt de pagina weer.
  let stuk = true, wegval = false;
  const env2 = { ...env, ASSETS: { fetch: async (r: Request | string) => { if (wegval) throw new Error("weg"); return String((r as Request).url ?? r).endsWith("/data.json") ? Response.json({}) : new Response(stuk ? new ReadableStream({ start(c) { c.error(new Error("afgebroken")); } }) : sjabloon, { headers: { "Content-Type": "text/html; charset=utf-8" } }); } } };
  const bezoek2 = (path: string) => onRequestGet({ request: new Request(`https://nieuwsinkort.nl${path}`), env: env2, waitUntil: () => {} });
  const doel = `/?nietmeten=1#/bericht/${(await import("../src/artikelid")).artikelId(item)}`;
  r = await bezoek2(`${pad}?nietmeten=1`); assert.equal(r.status, 302); assert.equal(r.headers.get("location"), doel); assert.equal(r.headers.get("cache-control"), "no-store");
  wegval = true; r = await bezoek2(`${pad}?nietmeten=1`); assert.equal(r.status, 302); assert.equal(r.headers.get("location"), doel);
  wegval = false; stuk = false; r = await bezoek2(pad); assert.equal(r.status, 200); assert.ok((await r.text()).includes("<h1>Nieuws &lt;script&gt;</h1>"));
} finally { Date.now = origineel; }
