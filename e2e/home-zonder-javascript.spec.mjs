import { test, expect } from "@playwright/test";
import { build } from "esbuild";

const BASIS = "http://127.0.0.1:4173";
test.use({ javaScriptEnabled: false, launchOptions: { executablePath: process.env.PW_CHROME || undefined, args: ["--no-sandbox"] } });
test("voorpagina toont briefing en koppen zonder JavaScript", async ({ page }) => {
  const { outputFiles } = await build({ entryPoints: ["functions/index.ts"], bundle: true, platform: "neutral", format: "esm", write: false, logLevel: "silent" });
  const functie = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString("base64")}`);
  const nu = new Date(), dag = nu.toLocaleDateString("en-CA", { timeZone: "Europe/Amsterdam" });
  const data = { gegenereerd: nu.toISOString(), dag_samenvatting: "De briefing van vandaag.", items: Array.from({ length: 12 }, (_, i) => ({ id: String(i).padStart(8, "0"), kop: `Actuele kop ${i}` })) };
  const env = { ASSETS: { fetch: (req) => fetch(typeof req === "string" ? req : req.url) }, NIEUWS: { get: async () => `${dag}\ntag\n${JSON.stringify(data)}` } };
  await page.route(`${BASIS}/`, async (route) => {
    const r = await functie.onRequestGet({ request: new Request(route.request().url()), env, waitUntil() {} });
    await route.fulfill({ status: r.status, headers: Object.fromEntries(r.headers), body: await r.text() });
  });
  await page.goto("/");
  await expect(page.getByText("De briefing van vandaag.")).toBeVisible();
  await expect(page.locator('a[href^="/bericht/"]')).toHaveCount(10);
  await expect(page.getByRole("link", { name: "Actuele kop 0" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Nieuws van vandaag" })).toHaveAttribute("href", "/vandaag");
  await expect(page.getByRole("link", { name: "Over Nieuws in het kort" })).toHaveAttribute("href", "/over");
});
