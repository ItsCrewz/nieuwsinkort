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

// Micro-interacties (#539): vinkje + toast bij "gekopieerd", opruimen na ~2 s, reduced motion zonder animatie.
const kopieerInit = (page) => page.addInitScript(() => {
  Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => {} } });
});
const openEnDeel = async (page) => {
  await page.goto("/#/");
  await page.locator(".nc-title a").first().click();
  await page.getByRole("button", { name: "Deel dit bericht" }).click();
};

test("gekopieerd: vinkje + toast, na ~2 s weg", async ({ page }) => {
  await kopieerInit(page);
  await openEnDeel(page);
  const knop = page.locator(".deel-knop");
  await expect(knop).toHaveClass(/gedaan/);
  await expect(page.locator(".deel-melding")).toHaveText("Link gekopieerd");
  await expect(page.locator(".deel-melding")).toHaveClass(/toon/);
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.querySelector(".ic-vink")).opacity)).toBe("1");
  await expect(page.locator(".deel-melding")).toBeHidden({ timeout: 3500 });
  await expect(knop).not.toHaveClass(/gedaan/);
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.querySelector(".ic-vink")).opacity)).toBe("0");
});

test("gekopieerd met reduced motion: toast direct, zonder animatie", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await kopieerInit(page);
  await openEnDeel(page);
  await expect(page.locator(".deel-melding")).toHaveText("Link gekopieerd");
  const trage = await page.evaluate(() => document.getAnimations().filter((a) => (a.effect?.getTiming().duration ?? 0) > 0.01).length);
  expect(trage).toBe(0);
  await expect(page.locator(".deel-melding")).toBeHidden({ timeout: 3500 });
});
