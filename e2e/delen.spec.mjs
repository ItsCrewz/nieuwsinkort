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

// #539: gekopieerd = vinkje + toast, na ~2 s weg; reduced motion: direct, zonder lopende animatie
const kopieerInit = (page) => page.addInitScript(() => {
  Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => {} } });
});
const opacity = (page, sel) => page.locator(sel).evaluate((e) => getComputedStyle(e).opacity);

test("gekopieerd toont vinkje en toast en ruimt na ~2 s op", async ({ page }) => {
  await kopieerInit(page);
  await page.goto("/#/");
  await page.locator(".nc-title a").first().click();
  await page.getByRole("button", { name: "Deel dit bericht" }).click();
  await expect(page.locator(".deel-melding.toon")).toHaveText("Link gekopieerd");
  await expect(page.locator(".deel-knop.ok")).toHaveCount(1);
  await expect.poll(() => opacity(page, ".deel-knop .ic-ok")).toBe("1");
  await expect.poll(() => opacity(page, ".deel-knop .ic-deel")).toBe("0");
  await expect(page.locator(".deel-melding.toon")).toHaveCount(0, { timeout: 3500 });
  await expect(page.locator(".deel-knop.ok")).toHaveCount(0);
  await expect.poll(() => opacity(page, ".deel-melding")).toBe("0");
});

test("reduced motion: toast staat er direct zonder lopende animatie", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await kopieerInit(page);
  await page.goto("/#/");
  await page.locator(".nc-title a").first().click();
  await page.getByRole("button", { name: "Deel dit bericht" }).click();
  await expect(page.locator(".deel-melding.toon")).toHaveText("Link gekopieerd");
  await expect.poll(() => opacity(page, ".deel-melding")).toBe("1");
  const traag = await page.evaluate(() => document.getAnimations().filter((a) => (a.effect?.getTiming().duration ?? 0) > 0.01 && a.playState === "running").length);
  expect(traag).toBe(0);
});
