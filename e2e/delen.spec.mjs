import { test, expect } from "@playwright/test";

test("deelt de eigen berichtlink", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", { configurable: true, value: async (data) => { window.gedeeldeLink = data.url; } });
    Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
  });
  await page.goto("/#/");
  await page.locator(".nc-title a").first().click();
  await page.getByRole("button", { name: "Deel dit bericht" }).click();
  await expect.poll(() => page.evaluate(() => window.gedeeldeLink)).toMatch(/^https:\/\/nieuwsinkort\.nl\/bericht\//);
});

test("kopieert de eigen berichtlink", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (url) => { window.gekopieerdeLink = url; } } });
  });
  await page.goto("/#/");
  await page.locator(".nc-title a").first().click();
  await page.getByRole("button", { name: "Deel dit bericht" }).click();
  await expect(page.getByText("Link gekopieerd")).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.gekopieerdeLink)).toMatch(/^https:\/\/nieuwsinkort\.nl\/bericht\//);
});
