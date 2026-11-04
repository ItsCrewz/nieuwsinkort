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

test("gekopieerd: vinkje + toast, ruimt na ~2 s op", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => {} } });
  });
  await page.goto("/#/");
  await page.locator(".nc-title a").first().click();
  const knop = page.getByRole("button", { name: "Deel dit bericht" });
  await knop.click();
  await expect(knop).toHaveClass(/\bok\b/);
  await expect(page.locator(".deel-melding")).toHaveText("Link gekopieerd");
  await expect(page.locator(".deel-melding")).toBeHidden({ timeout: 4000 });
  await expect(knop).not.toHaveClass(/\bok\b/);
});

test("gekopieerd met reduced motion: toast staat er direct, zonder animatie", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => {} } });
  });
  await page.goto("/#/");
  await page.locator(".nc-title a").first().click();
  await page.getByRole("button", { name: "Deel dit bericht" }).click();
  await expect(page.locator(".deel-melding")).toHaveText("Link gekopieerd");
  const traag = await page.evaluate(() => document.getAnimations().filter((a) => (a.effect?.getTiming().duration ?? 0) > 0.01 && a.playState === "running").map((a) => a.animationName || a.transitionProperty));
  expect(traag).toEqual([]);
});
