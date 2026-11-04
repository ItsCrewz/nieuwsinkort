// Serverpagina /bericht/…: de echte Pages Function (met esbuild gebundeld) levert de HTML aan de browser,
// inclusief CSP, zodat ook het inline deelscript onder de echte hash draait. Geen netwerk, geen AI.
import { test, expect, devices } from "@playwright/test";
import { build } from "esbuild";

const { defaultBrowserType, ...iphone } = devices["iPhone 15"];
const dag = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Amsterdam" });
const item = { kop: "Verdachten aangehouden voor mishandeling", ai: "Twee verdachten zijn aangehouden.", samenvatting: "De politie zocht al langer.", punten: ["Eén punt"], cat: "nl", tijd: "10:00", t: Date.now(), bronnen: [{ site: "NOS", href: "https://nos.nl/artikel/1" }] };
let functie, artikelid;

test.beforeAll(async () => {
  const bundel = async (bestand) => {
    const { outputFiles } = await build({ entryPoints: [bestand], bundle: true, platform: "neutral", format: "esm", write: false, logLevel: "silent" });
    return import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString("base64")}`);
  };
  functie = await bundel("functions/bericht/[[pad]].ts");
  artikelid = await bundel("src/artikelid.ts");
});

async function serveer(page, items = [item]) {
  const env = { ASSETS: { fetch: async () => Response.json({}) }, NIEUWS: { get: async () => `${dag}\ntag\n${JSON.stringify({ gegenereerd: new Date().toISOString(), items })}` } };
  await page.route("**/bericht/**", async (route) => {
    const r = await functie.onRequestGet({ request: new Request(route.request().url()), env, waitUntil() {} });
    await route.fulfill({ status: r.status, headers: Object.fromEntries(r.headers), body: Buffer.from(await r.arrayBuffer()) });
  });
  return artikelid.artikelPad(items[0], dag);
}

test("serverpagina rendert met title, canonical, OG en JSON-LD", async ({ page }) => {
  const pad = await serveer(page);
  const antwoord = await page.goto(pad);
  expect(antwoord.status()).toBe(200);
  await expect(page).toHaveTitle("Verdachten aangehouden voor mishandeling – Nieuws in het kort");
  await expect(page.locator("h1")).toHaveText(item.kop);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `https://nieuwsinkort.nl${pad}`);
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", "https://nieuwsinkort.nl/og-image.png");
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute("content", `https://nieuwsinkort.nl${pad}`);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", item.ai);
  const ld = JSON.parse(await page.locator('script[type="application/ld+json"]').textContent());
  expect(ld["@type"]).toBe("NewsArticle");
  await expect(page.getByRole("link", { name: "NOS" })).toHaveAttribute("href", "https://nos.nl/artikel/1");
  await expect(page.getByRole("link", { name: "Open in Nieuws in het kort" })).toHaveAttribute("href", `/#/bericht/${artikelid.artikelId(item)}`);
});

test("verlopen datum geeft 301 naar de voorpagina", async ({ page }) => {
  await serveer(page);
  const statussen = [];
  page.on("response", (r) => { if (r.url().includes("/bericht/")) statussen.push(r.status()); });
  await page.goto("/bericht/2020-01-01/aaaaaaaa-oud");
  expect(statussen).toEqual([301]);
  await expect(page).toHaveURL(/127\.0\.0\.1:4173\/(#.*)?$/);
});

test.describe("iPhone-emulatie", () => {
  test.use({ ...iphone });
  test.skip(({ browserName }) => browserName === "firefox", "isMobile wordt niet door Firefox ondersteund");
  test("deelknop roept navigator.share aan met onze URL", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "share", { configurable: true, value: async (d) => { window.gedeeld = d; } });
      Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
    });
    const pad = await serveer(page);
    await page.goto(pad);
    await page.getByRole("button", { name: "Deel dit bericht" }).click();
    await expect.poll(() => page.evaluate(() => window.gedeeld)).toEqual({ title: item.kop, url: `https://nieuwsinkort.nl${pad}` });
  });
});

test("desktop zonder share kopieert de link, en toont het invoerveld als kopiëren faalt", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (u) => { if (window.weiger) throw new Error("geweigerd"); window.gekopieerd = u; } } });
  });
  const pad = await serveer(page);
  await page.goto(pad);
  const knop = page.getByRole("button", { name: "Deel dit bericht" });
  await knop.click();
  await expect(page.locator("#melding")).toHaveText("Link gekopieerd");
  expect(await page.evaluate(() => window.gekopieerd)).toBe(`https://nieuwsinkort.nl${pad}`);
  await page.evaluate(() => { window.weiger = true; });
  await knop.click();
  await expect(page.locator("#melding")).toHaveText("Kopieer handmatig");
  await expect(page.locator("#link")).toBeFocused();
});
