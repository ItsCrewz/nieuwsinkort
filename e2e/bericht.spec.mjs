// Gedeelde pagina /bericht/…: de echte Pages Function (met esbuild gebundeld) levert de app-HTML met eigen kop-tags;
// de app toont dan dezelfde artikelweergave als bij openen in de app, met de home erachter (#541). Geen netwerk buiten de dev-server, geen AI.
import { test, expect, devices } from "@playwright/test";
import { build } from "esbuild";

const { defaultBrowserType, ...iphone } = devices["iPhone 15"];
const BASIS = "http://127.0.0.1:4173";
const nu = new Date();
const dag = nu.toLocaleDateString("en-CA", { timeZone: "Europe/Amsterdam" });
const item = { kop: "Verdachten aangehouden voor mishandeling", ai: "Twee verdachten zijn aangehouden.", samenvatting: "De politie zocht al langer.", punten: ["Eerste punt over de zaak", "Tweede punt over de aanhouding"], cat: "nl", tijd: "10:00", t: nu.getTime(), bronnen: [{ site: "NOS", href: "https://nos.nl/artikel/1" }, { site: "NU.nl", href: "https://nu.nl/artikel/2" }] };
let functie, artikelid, env;
test.use({ launchOptions: { executablePath: process.env.PW_CHROME || undefined, args: ["--no-sandbox"] } });

test.beforeAll(async () => {
  const bundel = async (bestand) => {
    const { outputFiles } = await build({ entryPoints: [bestand], bundle: true, platform: "neutral", format: "esm", write: false, logLevel: "silent" });
    return import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString("base64")}`);
  };
  functie = await bundel("functions/bericht/[[pad]].ts");
  artikelid = await bundel("src/artikelid.ts");
});

// Dagdata met ons testbericht vooraan; /bericht/… via de echte Function, met de dev-server als ASSETS (getransformeerde index.html).
async function serveer(page) {
  const statisch = await (await fetch(`${BASIS}/data.json`)).json();
  const data = { ...statisch, gegenereerd: nu.toISOString(), items: [item, ...statisch.items] };
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:)/, (route) => route.abort("blockedbyclient"));
  await page.route("**/data.json", (route) => route.fulfill({ json: data }));
  env = { ASSETS: { fetch: (req) => fetch(typeof req === "string" ? req : req.url) }, NIEUWS: { get: async () => `${dag}\ntag\n${JSON.stringify(data)}` } };
  await page.route("**/bericht/**", async (route) => {
    const r = await functie.onRequestGet({ request: new Request(route.request().url()), env, waitUntil() {} });
    await route.fulfill({ status: r.status, headers: Object.fromEntries(r.headers), body: Buffer.from(await r.arrayBuffer()) });
  });
  return artikelid.artikelPad(item, dag);
}

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

  test("serverpagina bevat title, canonical, OG en JSON-LD in de HTML", async ({ page }) => {
    const pad = await serveer(page);
    // ruwe HTML zoals een crawler hem ziet (geen JS)
    const r = await functie.onRequestGet({ request: new Request(`https://nieuwsinkort.nl${pad}`), env, waitUntil() {} });
    const html = await r.text();
    expect(r.status).toBe(200);
    expect(html).toContain(`<title>${item.kop} – Nieuws in het kort</title>`);
    expect(html).toContain(`<link rel="canonical" href="https://nieuwsinkort.nl${pad}" />`);
    expect(html).toContain(`<meta property="og:title" content="${item.kop}" />`);
    expect(html).toContain('"@type":"NewsArticle"');
    expect(html).toContain(`<h1>${item.kop}</h1>`);
  });

  test("gedeelde pagina toont dezelfde artikelweergave als in de app, met home erachter", async ({ page }) => {
    const pad = await serveer(page);
    // 1. in de app: open het artikel
    await page.goto("/#/");
    await expect(page.locator(".topbar")).toBeVisible();
    await page.evaluate((id) => { window.location.hash = `#/bericht/${id}`; }, artikelid.artikelId(item));
    await expect(page.locator("article.detail")).toBeVisible();
    await expect(page.locator("article.detail .d-lead")).toBeVisible();
    const inApp = await page.locator("article.detail").evaluate((el) => ({ klasse: el.className, tekst: el.innerText, stijl: getComputedStyle(el.querySelector(".d-title")).fontSize + getComputedStyle(el).maxWidth, koppen: [...el.querySelectorAll("h1,h2")].map((h) => h.textContent) }));
    // 2. gedeelde pagina
    await page.goto(pad);
    await expect(page.locator("article.detail")).toBeVisible();
    await expect(page.locator("article.detail .d-lead")).toBeVisible();
    const gedeeld = await page.locator("article.detail").evaluate((el) => ({ klasse: el.className, tekst: el.innerText, stijl: getComputedStyle(el.querySelector(".d-title")).fontSize + getComputedStyle(el).maxWidth, koppen: [...el.querySelectorAll("h1,h2")].map((h) => h.textContent) }));
    expect(gedeeld).toEqual(inApp);
    await expect(page.locator(".topbar")).toBeVisible(); // zelfde kop/header als de app
    await expect(page.getByRole("link", { name: /NOS/ }).first()).toBeVisible();
    // 3. server-HTML-tags blijven staan
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute("content", `https://nieuwsinkort.nl${pad}`);
    // 4. sluiten gaat naar de home (overzicht), niet uit de site
    await page.getByRole("button", { name: "Terug naar het nieuws" }).click();
    await expect(page.locator("article.detail")).toHaveCount(0);
    await expect(page).toHaveURL(/\/#\/$/);
    await expect(page.locator(".nc-title a, .lead").first()).toBeVisible();
  });

  test("deel-icoon: SVG, vast en zichtbaar bij scrollen, tapdoel >= 44px", async ({ page }) => {
    const pad = await serveer(page);
    await page.goto(pad);
    const knop = page.getByRole("button", { name: "Deel dit bericht" });
    await expect(knop).toBeVisible();
    await expect(knop.locator("svg")).toHaveCount(1);
    expect((await knop.innerText()).trim()).toBe(""); // geen tekst meer
    expect(await knop.evaluate((e) => getComputedStyle(e).position)).toBe("fixed");
    const b = await knop.boundingBox();
    expect(b.width).toBeGreaterThanOrEqual(44); expect(b.height).toBeGreaterThanOrEqual(44);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const na = await knop.boundingBox();
    expect(Math.round(na.y)).toBe(Math.round(b.y));
    const vp = page.viewportSize();
    expect(na.x + na.width).toBeLessThanOrEqual(vp.width); expect(na.y + na.height).toBeLessThanOrEqual(vp.height);
  });

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

  test("zonder Web Share: kopieert de link met toast; faalt kopiëren, dan invoerveld", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (u) => { if (window.weiger) throw new Error("geweigerd"); window.gekopieerd = u; } } });
    });
    const pad = await serveer(page);
    await page.goto(pad);
    const knop = page.getByRole("button", { name: "Deel dit bericht" });
    await knop.click();
    await expect(page.getByText("Link gekopieerd")).toBeVisible();
    expect(await page.evaluate(() => window.gekopieerd)).toBe(`https://nieuwsinkort.nl${pad}`);
    await page.evaluate(() => { window.weiger = true; });
    await knop.click();
    await expect(page.getByText("Kopieer handmatig")).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Link om handmatig te kopiëren" })).toBeVisible();
  });
});
