// Axe-controle (#584) op de server-gerenderde pagina's /vandaag en /bericht/… in licht en donker: 0 serious/critical.
// De echte Pages Functions (met esbuild gebundeld) leveren de HTML; externe verzoeken zijn geblokkeerd, geen AI.
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { build } from "esbuild";

const BASIS = "http://127.0.0.1:4173";
const nu = new Date();
const dag = nu.toLocaleDateString("en-CA", { timeZone: "Europe/Amsterdam" });
const item = { kop: "Verdachten aangehouden voor mishandeling", ai: "Twee verdachten zijn aangehouden.", samenvatting: "De politie zocht al langer.", punten: ["Eerste punt over de zaak", "Tweede punt over de aanhouding"], cat: "nl", tijd: "10:00", t: nu.getTime(), bronnen: [{ site: "NOS", href: "https://nos.nl/artikel/1" }, { site: "NU.nl", href: "https://nu.nl/artikel/2" }] };
let bericht, vandaag, artikelid;
test.use({ launchOptions: { executablePath: process.env.PW_CHROME || undefined, args: ["--no-sandbox"] } });

test.beforeAll(async () => {
  const bundel = async (bestand) => {
    const { outputFiles } = await build({ entryPoints: [bestand], bundle: true, platform: "neutral", format: "esm", write: false, logLevel: "silent" });
    return import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString("base64")}`);
  };
  bericht = await bundel("functions/bericht/[[pad]].ts");
  vandaag = await bundel("functions/vandaag.ts");
  artikelid = await bundel("src/artikelid.ts");
});

async function serveer(page) {
  const statisch = await (await fetch(`${BASIS}/data.json`)).json();
  const data = { ...statisch, gegenereerd: nu.toISOString(), items: [item, ...statisch.items] };
  const env = { ASSETS: { fetch: (req) => fetch(typeof req === "string" ? req : req.url) }, NIEUWS: { get: async () => `${dag}\ntag\n${JSON.stringify(data)}` } };
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:)/, (route) => route.abort("blockedbyclient"));
  await page.route("**/data.json", (route) => route.fulfill({ json: data }));
  for (const [deel, functie] of [["/bericht/**", bericht], ["**/vandaag", vandaag]]) {
    await page.route(deel, async (route) => {
      const r = await functie.onRequestGet({ request: new Request(route.request().url()), env, waitUntil() {} });
      await route.fulfill({ status: r.status, headers: Object.fromEntries(r.headers), body: Buffer.from(await r.arrayBuffer()) });
    });
  }
  return artikelid.artikelPad(item, dag);
}

for (const schema of ["light", "dark"]) {
  for (const naam of ["vandaag", "bericht"]) {
    test(`${naam} (${schema}): 0 serious/critical`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: schema });
      const pad = await serveer(page);
      await page.goto(naam === "vandaag" ? "/vandaag" : pad);
      await expect(page.locator(naam === "vandaag" ? "h1" : "article.detail .d-lead")).toBeVisible();
      // wacht tot entree-animaties klaar zijn: axe meet anders tussenkleuren (fade) als contrastfout
      await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {}))));
      const resultaat = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      const ernstig = resultaat.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(ernstig.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
    });
  }
}
